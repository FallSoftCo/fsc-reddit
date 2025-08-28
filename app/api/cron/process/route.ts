import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GoogleGenAI } from '@google/genai'

interface AnalysisResult {
  tldr: string
  summary: string
  timestampSeconds: number[]
  timestampDescriptions: string[]
}

export async function GET() {
  const startTime = Date.now()
  let analyzed = 0
  let posted = 0
  const errors: string[] = []
  
  try {
    console.log('🤖 Starting analysis and posting...')
    
    // Get videos that haven't been analyzed yet
    const videosToProcess = await prisma.video.findMany({
      where: {
        analyses: { none: {} }
      },
      orderBy: { createdAt: 'desc' },
      take: 1 // Process 1 video at a time
    })
    
    if (videosToProcess.length === 0) {
      console.log('📭 No videos available for processing')
      return NextResponse.json({
        success: true,
        analyzed: 0,
        posted: 0,
        errors: [],
        duration: Math.round((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString()
      })
    }
    
    console.log(`🎬 Processing ${videosToProcess.length} video...`)
    
    for (const video of videosToProcess) {
      try {
        console.log(`🤖 Analyzing video: ${video.title}`)
        
        // Initialize Gemini AI
        const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
        
        // Generate analysis
        const analysis = await analyzeVideo(genai, video)
        
        // Save analysis to database
        const savedAnalysis = await prisma.analysis.create({
          data: {
            videoId: video.id,
            summary: analysis.summary,
            tldr: analysis.tldr,
            timestampSeconds: analysis.timestampSeconds,
            timestampDescriptions: analysis.timestampDescriptions
          }
        })
        
        analyzed++
        console.log(`✅ Analysis saved for: ${video.title}`)
        
        // Format for Reddit
        const videoUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`
        const postTitle = `📺 ${video.title}`
        const analysisComment = formatAnalysisComment(analysis, videoUrl)
        
        // Post to Reddit
        try {
          console.log(`📮 Posting to Reddit: ${postTitle}`)
          
          // Create Reddit client
          const redditClient = createRedditClient()
          
          // Post video link to Reddit
          const redditResponse = await redditClient.submitPost('tlyt', postTitle, undefined, videoUrl)
          const postId = redditResponse.json?.data?.name || redditResponse.json?.data?.id
          
          // Post analysis as comment if we got a post ID
          let commentPosted = false
          if (postId) {
            try {
              await redditClient.submitComment(postId, analysisComment)
              commentPosted = true
              console.log(`✅ Posted analysis comment to post`)
            } catch (commentError) {
              console.error('❌ Failed to post analysis comment:', commentError)
            }
          }
          
          // Save Reddit post record
          await prisma.redditPost.create({
            data: {
              videoId: video.id,
              analysisId: savedAnalysis.id,
              redditId: postId || null,
              title: postTitle,
              content: analysisComment,
              url: videoUrl,
              status: commentPosted ? 'POSTED' : 'PARTIAL',
              postedAt: new Date()
            }
          })
          
          posted++
          console.log(`✅ Posted video link to Reddit: ${postTitle}`)
          
        } catch (redditError) {
          const errorMsg = `Failed to post to Reddit: ${redditError instanceof Error ? redditError.message : 'Unknown error'}`
          errors.push(errorMsg)
          console.error('❌', errorMsg)
          
          // Save failed Reddit post record
          await prisma.redditPost.create({
            data: {
              videoId: video.id,
              analysisId: savedAnalysis.id,
              title: postTitle,
              content: analysisComment,
              url: videoUrl,
              status: 'FAILED',
              errorMessage: errorMsg
            }
          })
        }
        
      } catch (error) {
        const errorMsg = `Failed to process video ${video.youtubeId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        errors.push(errorMsg)
        console.error('❌', errorMsg)
      }
    }
    
    const duration = Date.now() - startTime
    
    console.log(`🎉 Processing complete:`)
    console.log(`   🧠 Videos analyzed: ${analyzed}`)
    console.log(`   📮 Reddit posts: ${posted}`)
    console.log(`   ❌ Errors: ${errors.length}`)
    console.log(`   ⏱️ Duration: ${Math.round(duration / 1000)}s`)
    
    return NextResponse.json({
      success: true,
      analyzed,
      posted,
      errors,
      duration: Math.round(duration / 1000),
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Processing failed:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Processing failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

async function analyzeVideo(genai: GoogleGenAI, video: {
  id: string
  youtubeId: string
  title: string
  description: string | null
  channelTitle: string
  publishedAt: Date
  duration: string
  tags: string[]
  categoryId: string | null
  viewCount: bigint | null
  likeCount: bigint | null
}): Promise<AnalysisResult> {
  // Parse video duration to seconds
  const durationInSeconds = parseISO8601Duration(video.duration)
  
  // Generate 15 mathematically distributed timestamps with jitter
  const numStructuredTimestamps = 15
  const baseInterval = durationInSeconds / (numStructuredTimestamps + 1)
  const structuredTimestamps = []
  
  for (let i = 1; i <= numStructuredTimestamps; i++) {
    const baseTime = Math.round(i * baseInterval)
    // Add small jitter (±5% of interval, max ±10 seconds)
    const jitter = Math.round((Math.random() - 0.5) * Math.min(baseInterval * 0.1, 20))
    const timestamp = Math.max(5, Math.min(durationInSeconds - 5, baseTime + jitter))
    structuredTimestamps.push(timestamp)
  }
  structuredTimestamps.sort((a, b) => a - b)

  // Build metadata context
  const today = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })
  
  const publishedDate = new Date(video.publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long', 
    day: 'numeric'
  })

  const metadataContext = `
VIDEO CONTEXT & METADATA:
- Today's Date: ${today}
- Video Title: "${video.title}"
- Channel: ${video.channelTitle}
- Published: ${publishedDate}${video.description ? `\n- Description: ${video.description.slice(0, 500)}${video.description.length > 500 ? '...' : ''}` : ''}${video.tags && video.tags.length > 0 ? `\n- Tags: ${video.tags.slice(0, 15).join(', ')}${video.tags.length > 15 ? '...' : ''}` : ''}${video.categoryId ? `\n- Category: ${video.categoryId}` : ''}${video.viewCount ? `\n- Views: ${Number(video.viewCount).toLocaleString()}` : ''}${video.likeCount ? `\n- Likes: ${Number(video.likeCount).toLocaleString()}` : ''}`

  const prompt = `${metadataContext}

ANALYSIS INSTRUCTIONS:
Analyze this video comprehensively using the provided metadata context. Provide a detailed summary and create a concise TL;DR.

Use the video title, channel expertise, tags, and description to understand the subject matter and use appropriate terminology. Consider the publication date relative to today's date for temporal context.

This video is ${durationInSeconds} seconds long. 

MANDATORY REQUIREMENT: You MUST include timestamps from BOTH categories below:

1. REQUIRED STRUCTURED TIMESTAMPS: You are REQUIRED to analyze and include ALL of these ${numStructuredTimestamps} specific times in your response. These ensure complete video coverage:
${structuredTimestamps.map(t => `- ${t} seconds (MANDATORY)`).join('\n')}

2. ADDITIONAL CONTENT-DRIVEN TIMESTAMPS: After including all required structured timestamps above, you may also add up to 5 additional significant moments:
- Key transitions or topic changes
- Important points or revelations
- Dramatic or pivotal moments
- Critical information or insights
- Major shifts in tone, content, or direction

CRITICAL INSTRUCTIONS:
- ALL ${numStructuredTimestamps} structured timestamps listed above are MANDATORY - you must describe what happens at each one
- Do not skip any of the required structured timestamps
- Use specific terms and concepts from the video title, tags, and description
- Do not include timestamp values (like "30s", "1:45", etc.) in descriptions
- Descriptions should only describe what happens, not when it happens
- Focus on the content and action, not the timing

Your response must include ALL ${numStructuredTimestamps} mandatory structured timestamps plus any additional significant moments. Ensure all timestamps are between 0 and ${durationInSeconds} seconds and are sorted chronologically.

Respond with a JSON object with this structure:
{
  "summary": "Comprehensive video summary",
  "tldr": "Concise TL;DR summary", 
  "timestamps": [
    {
      "seconds": 123,
      "description": "What happens at this timestamp"
    }
  ]
}`

  const response = await genai.models.generateContent({
    model: 'gemini-2.0-flash-001',
    contents: prompt,
    config: {
      responseMimeType: "application/json"
    }
  })
  
  const responseText = response.text
  if (!responseText) {
    throw new Error('Empty response from Gemini API')
  }
  const analysisData = JSON.parse(responseText)
  
  // Validate response structure
  if (!analysisData.summary || !analysisData.tldr || !Array.isArray(analysisData.timestamps)) {
    throw new Error('Invalid analysis data structure from API')
  }

  // Filter and validate timestamps
  const validTimestamps = analysisData.timestamps.filter((timestamp: {seconds?: unknown, description?: unknown}) => {
    if (typeof timestamp.seconds === 'number' && typeof timestamp.description === 'string') {
      if (timestamp.seconds >= 0 && timestamp.seconds <= durationInSeconds) {
        return true
      } else {
        console.warn(`Skipping out-of-bounds timestamp: ${timestamp.seconds}s (video is ${durationInSeconds}s)`)
        return false
      }
    }
    return false
  })

  // Sort timestamps chronologically
  const finalTimestamps = validTimestamps.sort((a: {seconds: number}, b: {seconds: number}) => a.seconds - b.seconds)
  
  // Transform to required format
  const timestampSeconds: number[] = []
  const timestampDescriptions: string[] = []
  
  for (const timestamp of finalTimestamps) {
    timestampSeconds.push(timestamp.seconds)
    timestampDescriptions.push(timestamp.description)
  }
  
  console.log(`✅ Analysis complete: ${finalTimestamps.length} timestamps generated`)
  
  return {
    tldr: analysisData.tldr,
    summary: analysisData.summary,
    timestampSeconds,
    timestampDescriptions
  }
}

function formatAnalysisComment(analysis: AnalysisResult, videoUrl: string): string {
  let content = `**🎯 TL;DR:** ${analysis.tldr}\n\n`
  content += `**📋 Timestamps:**\n\n`
  
  // Add timestamps with clickable links
  for (let i = 0; i < analysis.timestampSeconds.length; i++) {
    const seconds = analysis.timestampSeconds[i]
    const description = analysis.timestampDescriptions[i]
    const timestamp = formatTimestamp(seconds)
    const timestampUrl = `${videoUrl}&t=${seconds}s`
    content += `• [${timestamp}](${timestampUrl}) - ${description}\n`
  }
  
  content += `\n**📖 Full Summary:**\n\n${analysis.summary}\n\n`
  content += `---\n*🤖 Automated analysis for r/tlyt community*`
  
  return content
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function parseISO8601Duration(duration: string): number {
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return 300 // fallback to 5 minutes
  
  const hours = parseInt(match[1] || '0', 10)
  const minutes = parseInt(match[2] || '0', 10)
  const seconds = parseInt(match[3] || '0', 10)
  
  return hours * 3600 + minutes * 60 + seconds
}

function createRedditClient() {
  return {
    async submitPost(subreddit: string, title: string, text?: string, url?: string) {
      const auth = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64')
      
      // Get access token
      const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'User-Agent': `web:tlyt-reddit-bot:v1.0.0 (by u/${process.env.REDDIT_USERNAME})`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'password',
          username: process.env.REDDIT_USERNAME!,
          password: process.env.REDDIT_PASSWORD!,
        }),
      })

      if (!tokenResponse.ok) {
        throw new Error(`Failed to get access token: ${tokenResponse.status}`)
      }

      const tokenData = await tokenResponse.json()
      
      // Submit post
      const data: Record<string, string> = {
        sr: subreddit,
        title,
        kind: text ? 'self' : 'link',
      }

      if (text) {
        data.text = text
      }
      if (url) {
        data.url = url
      }

      const response = await fetch('https://oauth.reddit.com/api/submit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'User-Agent': `web:tlyt-reddit-bot:v1.0.0 (by u/${process.env.REDDIT_USERNAME})`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(data),
      })

      if (!response.ok) {
        throw new Error(`Reddit API request failed: ${response.status}`)
      }

      return response.json()
    },

    async submitComment(parentId: string, text: string) {
      const auth = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64')
      
      // Get access token
      const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'User-Agent': `web:tlyt-reddit-bot:v1.0.0 (by u/${process.env.REDDIT_USERNAME})`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'password',
          username: process.env.REDDIT_USERNAME!,
          password: process.env.REDDIT_PASSWORD!,
        }),
      })

      if (!tokenResponse.ok) {
        throw new Error(`Failed to get access token: ${tokenResponse.status}`)
      }

      const tokenData = await tokenResponse.json()

      const response = await fetch('https://oauth.reddit.com/api/comment', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'User-Agent': `web:tlyt-reddit-bot:v1.0.0 (by u/${process.env.REDDIT_USERNAME})`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          parent: parentId,
          text,
        }),
      })

      if (!response.ok) {
        throw new Error(`Reddit API request failed: ${response.status}`)
      }

      return response.json()
    }
  }
}