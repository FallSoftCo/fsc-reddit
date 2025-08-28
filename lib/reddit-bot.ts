import { prisma } from './prisma'
import { YouTubeDiscovery, YouTubeVideo } from './youtube-discovery'
import { VideoAnalyzer } from './video-analyzer'
import { createRedditClient } from './reddit-client'

export interface ProcessingResult {
  discovered: number
  analyzed: number
  posted: number
  errors: string[]
}

export class RedditBot {
  private youtube: YouTubeDiscovery
  private analyzer: VideoAnalyzer
  private reddit: ReturnType<typeof createRedditClient>

  constructor() {
    this.youtube = new YouTubeDiscovery()
    this.analyzer = new VideoAnalyzer()
    this.reddit = createRedditClient()
  }

  async discoverVideos(): Promise<ProcessingResult> {
    const errors: string[] = []
    let discovered = 0

    try {
      console.log('🔍 Starting video discovery...')
      
      // Get existing video IDs to prevent duplicates
      const existingVideoIds = new Set(
        (await prisma.video.findMany({
          select: { youtubeId: true }
        })).map(video => video.youtubeId)
      )
      
      console.log(`🛡️ Found ${existingVideoIds.size} existing videos for duplicate prevention`)
      
      // Fetch trending videos from multiple regions
      const trendingVideos = await this.youtube.getTrendingVideos()
      
      // Save new videos to database
      for (const video of trendingVideos) {
        if (existingVideoIds.has(video.id)) {
          continue // Skip duplicates
        }
        
        try {
          await this.saveVideoToDatabase(video)
          discovered++
        } catch (error) {
          const errorMsg = `Failed to save video ${video.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
          errors.push(errorMsg)
          console.error('❌', errorMsg)
        }
      }
      
      console.log(`✅ Discovery complete: ${discovered} new videos saved`)
      
      return { discovered, analyzed: 0, posted: 0, errors }
      
    } catch (error) {
      const errorMsg = `Discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMsg)
      console.error('❌', errorMsg)
      
      return { discovered, analyzed: 0, posted: 0, errors }
    }
  }

  async processAndPost(maxVideos = 1): Promise<ProcessingResult> {
    const errors: string[] = []
    let analyzed = 0
    let posted = 0

    try {
      console.log('🤖 Starting analysis and posting...')
      
      // Get videos that haven't been analyzed yet
      const videosToProcess = await prisma.video.findMany({
        where: {
          analyses: { none: {} }
        },
        orderBy: { createdAt: 'desc' },
        take: maxVideos
      })
      
      if (videosToProcess.length === 0) {
        console.log('📭 No videos available for processing')
        return { discovered: 0, analyzed, posted, errors }
      }
      
      console.log(`🎬 Processing ${videosToProcess.length} videos...`)
      
      for (const video of videosToProcess) {
        try {
          // Generate analysis
          const analysis = await this.analyzer.analyzeVideo({
            youtubeId: video.youtubeId,
            title: video.title,
            description: video.description,
            channelTitle: video.channelTitle,
            publishedAt: video.publishedAt,
            duration: video.duration,
            tags: video.tags,
            categoryId: video.categoryId,
            viewCount: video.viewCount,
            likeCount: video.likeCount
          })
          
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
          const postTitle = this.reddit.formatPostTitle(video.title)
          const analysisComment = this.reddit.formatAnalysisComment(analysis, videoUrl)
          
          // Post video link to Reddit
          try {
            const redditResponse = await this.reddit.submitPost('tlyt', postTitle, undefined, videoUrl)
            const postId = redditResponse.json?.data?.name || redditResponse.json?.data?.id
            
            // Post analysis as comment if we got a post ID
            let commentPosted = false
            if (postId) {
              try {
                await this.reddit.submitComment(postId, analysisComment)
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
      
      console.log(`🎉 Processing complete: ${analyzed} analyzed, ${posted} posted`)
      
      return { discovered: 0, analyzed, posted, errors }
      
    } catch (error) {
      const errorMsg = `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMsg)
      console.error('❌', errorMsg)
      
      return { discovered: 0, analyzed, posted, errors }
    }
  }

  private async saveVideoToDatabase(youtubeVideo: YouTubeVideo): Promise<void> {
    const publishedAt = new Date(youtubeVideo.snippet.publishedAt)
    
    await prisma.video.create({
      data: {
        youtubeId: youtubeVideo.id,
        title: youtubeVideo.snippet.title,
        description: youtubeVideo.snippet.description || null,
        channelId: youtubeVideo.snippet.channelId,
        channelTitle: youtubeVideo.snippet.channelTitle,
        publishedAt,
        duration: youtubeVideo.contentDetails?.duration || 'PT0S',
        tags: youtubeVideo.snippet.tags || [],
        categoryId: youtubeVideo.snippet.categoryId || null,
        viewCount: youtubeVideo.statistics?.viewCount ? BigInt(youtubeVideo.statistics.viewCount) : null,
        likeCount: youtubeVideo.statistics?.likeCount ? BigInt(youtubeVideo.statistics.likeCount) : null,
        commentCount: youtubeVideo.statistics?.commentCount ? BigInt(youtubeVideo.statistics.commentCount) : null,
        region: youtubeVideo.region || 'US'
      }
    })
  }
}