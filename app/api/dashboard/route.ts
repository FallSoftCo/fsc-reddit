import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
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

    return NextResponse.json({
      totalVideos,
      totalAnalyses,
      totalRedditPosts,
      recentPosts,
      pendingPosts
    })
  } catch (error) {
    console.error('Failed to fetch stats:', error)
    return NextResponse.json({
      totalVideos: 0,
      totalAnalyses: 0,
      totalRedditPosts: 0,
      recentPosts: 0,
      pendingPosts: 0
    })
  }
}