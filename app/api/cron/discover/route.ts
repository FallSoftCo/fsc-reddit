import { NextResponse } from 'next/server'
import { RedditBot } from '@/lib/reddit-bot'

export async function GET() {
  const startTime = Date.now()
  
  try {
    console.log('🔍 Starting video discovery cron job...')
    
    const bot = new RedditBot()
    const result = await bot.discoverVideos()
    
    const duration = Date.now() - startTime
    
    console.log(`🎉 Discovery cron complete:`)
    console.log(`   📊 Videos discovered: ${result.discovered}`)
    console.log(`   ❌ Errors: ${result.errors.length}`)
    console.log(`   ⏱️ Duration: ${Math.round(duration / 1000)}s`)
    
    return NextResponse.json({
      success: true,
      discovered: result.discovered,
      errors: result.errors,
      duration: Math.round(duration / 1000),
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Discovery cron failed:', error)
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