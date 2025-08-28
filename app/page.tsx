import { prisma } from '@/lib/prisma'

async function getStats() {
  try {
    const [
      totalVideos,
      totalAnalyses, 
      totalRedditPosts,
      recentPosts,
      pendingPosts
    ] = await Promise.all([
      prisma.video.count(),
      prisma.analysis.count(),
      prisma.redditPost.count(),
      prisma.redditPost.count({
        where: { 
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          status: 'POSTED'
        }
      }),
      prisma.redditPost.count({ where: { status: 'PENDING' } })
    ])

    return {
      totalVideos,
      totalAnalyses,
      totalRedditPosts,
      recentPosts,
      pendingPosts
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error)
    return {
      totalVideos: 0,
      totalAnalyses: 0, 
      totalRedditPosts: 0,
      recentPosts: 0,
      pendingPosts: 0
    }
  }
}

export default async function Dashboard() {
  const stats = await getStats()

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            r/tlyt Reddit Bot Dashboard
          </h1>
          <p className="text-gray-600">
            Monitoring autonomous video analysis and Reddit posting
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-2xl font-bold text-blue-600 mb-1">
              {stats.totalVideos.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Total Videos</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-2xl font-bold text-green-600 mb-1">
              {stats.totalAnalyses.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Analyses Generated</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-2xl font-bold text-purple-600 mb-1">
              {stats.totalRedditPosts.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Reddit Posts</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-2xl font-bold text-orange-600 mb-1">
              {stats.recentPosts.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Posts (24h)</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-2xl font-bold text-yellow-600 mb-1">
              {stats.pendingPosts.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">System Status</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Discovery Cron</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                  6AM & 6PM Daily
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Processing Cron</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                  Every 5 minutes
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Target Subreddit</span>
                <a 
                  href="https://reddit.com/r/tlyt" 
                  target="_blank"
                  className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-sm hover:bg-orange-200"
                >
                  r/tlyt
                </a>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Manual Controls</h3>
            </div>
            <div className="p-6 space-y-4">
              <button
                onClick="window.open('/api/cron/discover', '_blank')"
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                🔍 Trigger Discovery Now
              </button>
              <button
                onClick="window.open('/api/cron/process', '_blank')"
                className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                🤖 Trigger Processing Now
              </button>
              <p className="text-xs text-gray-500">
                Discovery finds new trending videos. Processing analyzes and posts to Reddit.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">How It Works</h3>
            </div>
            <div className="p-6 space-y-3 text-sm text-gray-600">
              <div>🔍 <strong>Discovery:</strong> Fetches trending videos from multiple regions</div>
              <div>🤖 <strong>Analysis:</strong> AI generates comprehensive video analysis with timestamps</div>
              <div>📮 <strong>Posting:</strong> Formats and posts analysis to r/tlyt subreddit</div>
              <div>🚫 <strong>Deduplication:</strong> Prevents duplicate video processing</div>
              <div>⚡ <strong>Automation:</strong> Fully autonomous with Vercel cron jobs</div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-gray-500 text-sm">
          Last updated: {new Date().toLocaleString()}
        </div>
      </div>
    </div>
  )
}
