import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface YouTubeVideo {
  id: string
  snippet: {
    title: string
    description?: string
    channelId: string
    channelTitle: string
    publishedAt: string
    tags?: string[]
    categoryId?: string
  }
  contentDetails?: {
    duration?: string
  }
  statistics?: {
    viewCount?: string
    likeCount?: string
    commentCount?: string
  }
  region?: string
}

export async function GET() {
  const startTime = Date.now()
  
  try {
    console.log('🔍 Starting trending video discovery...')
    
    // Get existing video IDs to prevent duplicates
    const existingVideoIds = new Set(
      (await prisma.video.findMany({
        select: { youtubeId: true }
      })).map(video => video.youtubeId)
    )
    
    console.log(`🛡️ Found ${existingVideoIds.size} existing videos for duplicate prevention`)
    
    // Regions to fetch trending videos from
    const regions = ['US', 'UK', 'CA', 'AU', 'IN']
    const allVideos: YouTubeVideo[] = []
    
    console.log('🌍 Fetching trending videos from multiple regions...')
    
    for (const region of regions) {
      try {
        console.log(`🌍 Fetching trending videos for region: ${region}`)
        
        const response = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?` +
          `part=snippet,contentDetails,statistics&chart=mostPopular&` +
          `regionCode=${region}&maxResults=50&` +
          `key=${process.env.YOUTUBE_API_KEY}`
        )
        
        if (!response.ok) {
          console.error(`❌ YouTube API error for ${region}: ${response.status}`)
          continue
        }

        const data = await response.json()
        const regionVideos = data.items || []
        
        // Add region info to each video
        regionVideos.forEach((video: YouTubeVideo) => {
          allVideos.push({
            ...video,
            region
          })
        })
        
        console.log(`✅ Found ${regionVideos.length} trending videos from ${region}`)
        
        // Add small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200))
        
      } catch (error) {
        console.error(`❌ Error fetching trending videos for ${region}:`, error)
      }
    }
    
    // Remove duplicates based on video ID
    const uniqueVideos = allVideos.filter((video, index, arr) => 
      arr.findIndex(v => v.id === video.id) === index
    )
    
    console.log(`🎯 Total unique trending videos discovered: ${uniqueVideos.length}`)
    
    // Save new videos to database
    let discovered = 0
    const errors: string[] = []
    
    for (const video of uniqueVideos) {
      if (existingVideoIds.has(video.id)) {
        continue // Skip duplicates
      }
      
      try {
        const publishedAt = new Date(video.snippet.publishedAt)
        
        await prisma.video.create({
          data: {
            youtubeId: video.id,
            title: video.snippet.title,
            description: video.snippet.description || null,
            channelId: video.snippet.channelId,
            channelTitle: video.snippet.channelTitle,
            publishedAt,
            duration: video.contentDetails?.duration || 'PT0S',
            tags: video.snippet.tags || [],
            categoryId: video.snippet.categoryId || null,
            viewCount: video.statistics?.viewCount ? BigInt(video.statistics.viewCount) : null,
            likeCount: video.statistics?.likeCount ? BigInt(video.statistics.likeCount) : null,
            commentCount: video.statistics?.commentCount ? BigInt(video.statistics.commentCount) : null,
            region: video.region || 'US'
          }
        })
        
        discovered++
      } catch (error) {
        const errorMsg = `Failed to save video ${video.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        errors.push(errorMsg)
        console.error('❌', errorMsg)
      }
    }
    
    const duration = Date.now() - startTime
    
    console.log(`🎉 Discovery complete:`)
    console.log(`   📊 Videos discovered: ${discovered}`)
    console.log(`   ❌ Errors: ${errors.length}`)
    console.log(`   ⏱️ Duration: ${Math.round(duration / 1000)}s`)
    
    return NextResponse.json({
      success: true,
      discovered,
      errors,
      duration: Math.round(duration / 1000),
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Discovery failed:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Discovery failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}