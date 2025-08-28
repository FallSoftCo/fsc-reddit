interface RedditConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  userAgent: string;
}

interface RedditTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export class RedditClient {
  private config: RedditConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: RedditConfig) {
    this.config = config;
  }

  private async getAccessToken(): Promise<string> {
    // Check if current token is still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'User-Agent': this.config.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username: this.config.username,
        password: this.config.password,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.status}`);
    }

    const tokenData: RedditTokenResponse = await response.json();
    this.accessToken = tokenData.access_token;
    // Set expiry with 5 minute buffer
    this.tokenExpiry = Date.now() + ((tokenData.expires_in - 300) * 1000);
    
    return this.accessToken;
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const token = await this.getAccessToken();
    
    const response = await fetch(`https://oauth.reddit.com${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': this.config.userAgent,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Reddit API request failed: ${response.status}`);
    }

    return response.json();
  }

  // Get posts from a subreddit
  async getSubredditPosts(subreddit: string, sort: 'hot' | 'new' | 'top' = 'hot', limit = 25) {
    return this.makeRequest(`/r/${subreddit}/${sort}?limit=${limit}`);
  }

  // Submit a post
  async submitPost(subreddit: string, title: string, text?: string, url?: string) {
    const data: Record<string, string> = {
      sr: subreddit,
      title,
      kind: text ? 'self' : 'link',
    };

    if (text) {
      data.text = text;
    }
    if (url) {
      data.url = url;
    }

    return this.makeRequest('/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(data),
    });
  }

  // Format analysis for Reddit comment (to be posted under the video link)
  formatAnalysisComment(analysis: {
    tldr: string;
    summary: string;
    timestampSeconds: number[];
    timestampDescriptions: string[];
  }, videoUrl: string): string {
    // Format analysis as comment content
    let content = `**🎯 TL;DR:** ${analysis.tldr}\n\n`;
    content += `**📋 Timestamps:**\n\n`;
    
    // Add timestamps with clickable links
    for (let i = 0; i < analysis.timestampSeconds.length; i++) {
      const seconds = analysis.timestampSeconds[i];
      const description = analysis.timestampDescriptions[i];
      const timestamp = this.formatTimestamp(seconds);
      const timestampUrl = `${videoUrl}&t=${seconds}s`;
      content += `• [${timestamp}](${timestampUrl}) - ${description}\n`;
    }
    
    content += `\n**📖 Full Summary:**\n\n${analysis.summary}\n\n`;
    content += `---\n*🤖 Automated analysis for r/tlyt community*`;
    
    return content;
  }

  // Create Reddit post title from video title
  formatPostTitle(videoTitle: string): string {
    return `📺 ${videoTitle}`;
  }

  private formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Submit a comment
  async submitComment(parentId: string, text: string) {
    return this.makeRequest('/api/comment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        parent: parentId,
        text,
      }),
    });
  }

  // Get user's inbox
  async getInbox() {
    return this.makeRequest('/message/inbox');
  }

  // Vote on a post/comment (1 = upvote, -1 = downvote, 0 = no vote)
  async vote(id: string, dir: 1 | -1 | 0) {
    return this.makeRequest('/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        id,
        dir: dir.toString(),
      }),
    });
  }
}

// Factory function to create client with environment variables
export function createRedditClient(): RedditClient {
  const config: RedditConfig = {
    clientId: process.env.REDDIT_CLIENT_ID!,
    clientSecret: process.env.REDDIT_CLIENT_SECRET!,
    username: process.env.REDDIT_USERNAME!,
    password: process.env.REDDIT_PASSWORD!,
    userAgent: `web:tlyt-reddit-bot:v1.0.0 (by u/${process.env.REDDIT_USERNAME})`,
  };

  return new RedditClient(config);
}