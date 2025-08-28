import { NextResponse } from 'next/server'
import { RedditBot } from '@/lib/reddit-bot'

export async function GET() {
  const startTime = Date.now()
  
  try {
    console.log('🤖 Starting analysis and posting cron job...')
    
    const bot = new RedditBot()
    const result = await bot.processAndPost(1) // Process 1 video at a time
    
    const duration = Date.now() - startTime
    
    console.log(`🎉 Processing cron complete:`)
    console.log(`   🧠 Videos analyzed: ${result.analyzed}`)
    console.log(`   📮 Reddit posts: ${result.posted}`)
    console.log(`   ❌ Errors: ${result.errors.length}`)
    console.log(`   ⏱️ Duration: ${Math.round(duration / 1000)}s`)
    
    return NextResponse.json({
      success: true,
      analyzed: result.analyzed,
      posted: result.posted,
      errors: result.errors,
      duration: Math.round(duration / 1000),
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Processing cron failed:', error)
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