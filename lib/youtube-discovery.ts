export interface YouTubeVideo {
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

export class YouTubeDiscovery {
  private apiKey: string
  private baseUrl = 'https://www.googleapis.com/youtube/v3'

  constructor() {
    const apiKey = process.env.YOUTUBE_API_KEY
    if (!apiKey) {
      throw new Error('YOUTUBE_API_KEY is required')
    }
    this.apiKey = apiKey
  }

  async getTrendingVideos(regions: string[] = ['US', 'UK', 'CA', 'AU', 'IN'], maxResults = 50): Promise<YouTubeVideo[]> {
    const allVideos: YouTubeVideo[] = []
    
    for (const region of regions) {
      try {
        console.log(`🌍 Fetching trending videos for region: ${region}`)
        
        const params = new URLSearchParams({
          part: 'id,snippet,contentDetails,statistics',
          chart: 'mostPopular',
          regionCode: region,
          maxResults: maxResults.toString(),
          key: this.apiKey
        })

        const response = await fetch(`${this.baseUrl}/videos?${params}`)
        
        if (!response.ok) {
          const errorData = await response.text()
          console.error(`❌ YouTube API error for ${region}: ${response.status} - ${errorData}`)
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
    return uniqueVideos
  }

  async getVideoDetails(videoIds: string[]): Promise<YouTubeVideo[]> {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      id: videoIds.join(','),
      key: this.apiKey
    })

    const response = await fetch(`${this.baseUrl}/videos?${params}`)
    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`YouTube API error: ${response.status} - ${errorData}`)
    }

    const data = await response.json()
    return data.items || []
  }

  parseISO8601Duration(duration: string): number {
    const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
    if (!match) return 300 // fallback to 5 minutes
    
    const hours = parseInt(match[1] || '0', 10)
    const minutes = parseInt(match[2] || '0', 10)
    const seconds = parseInt(match[3] || '0', 10)
    
    return hours * 3600 + minutes * 60 + seconds
  }
}