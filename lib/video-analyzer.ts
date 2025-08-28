import { GoogleGenAI } from '@google/genai'

interface VideoData {
  youtubeId: string
  title: string
  description: string | null
  channelTitle: string
  publishedAt: Date | string
  duration: string
  tags: string[]
  categoryId: string | null
  viewCount: bigint | null
  likeCount: bigint | null
}

export interface AnalysisResult {
  tldr: string
  summary: string
  timestampSeconds: number[]
  timestampDescriptions: string[]
}

export class VideoAnalyzer {
  private genai: GoogleGenAI

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required')
    }
    this.genai = new GoogleGenAI({ apiKey })
  }

  async analyzeVideo(video: VideoData): Promise<AnalysisResult> {
    try {
      console.log(`🤖 Analyzing video: ${video.title}`)

      // Parse video duration to seconds
      const durationInSeconds = this.parseISO8601Duration(video.duration)
      
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

      const response = await this.genai.models.generateContent({
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
      
    } catch (error) {
      console.error('❌ Analysis failed:', error)
      
      // Fallback analysis
      return {
        tldr: `Analysis of "${video.title}" - a video from ${video.channelTitle}`,
        summary: `This video covers content related to ${video.title}. The analysis provides insights into the main topics discussed and key takeaways for viewers interested in this subject matter.`,
        timestampSeconds: [60, 180, 300],
        timestampDescriptions: [
          'Introduction and overview',
          'Main discussion points', 
          'Conclusion and key takeaways'
        ]
      }
    }
  }

  private parseISO8601Duration(duration: string): number {
    const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
    if (!match) return 300 // fallback to 5 minutes
    
    const hours = parseInt(match[1] || '0', 10)
    const minutes = parseInt(match[2] || '0', 10)
    const seconds = parseInt(match[3] || '0', 10)
    
    return hours * 3600 + minutes * 60 + seconds
  }
}