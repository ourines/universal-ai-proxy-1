# Universal AI API Proxy

🌐 Universal AI API proxy that converts Claude and Gemini API requests to any OpenAI-compatible endpoint with configurable target models.

## ✨ Features

- 🔄 **Claude API Compatibility**: Full support for Claude (Anthropic) API format
- 🚀 **Gemini API Compatibility**: Complete Gemini (Google) API support
- ⚙️ **Configurable Target Models**: Set any OpenAI-compatible endpoint via environment variables
- 🛠️ **Tool/Function Calling**: Complete support for tool and function calling

## 🚀 Quick Deploy to Cloudflare Workers

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ourines/universal-ai-proxy)

### One-Click Deployment

1. Click the "Deploy to Cloudflare Workers" button above
2. Connect your GitHub account to Cloudflare
3. Configure environment variables (optional)
4. Deploy instantly!

### Manual Deployment

```bash
# Clone the repository
git clone https://github.com/ourines/universal-ai-proxy
cd universal-ai-proxy

# Install dependencies
npm install

# Deploy to Cloudflare Workers
npm run deploy
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## ⚙️ Configuration

### Environment Variables

Configure your target endpoint using these optional environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_MODEL` | `moonshotai/kimi-k2-instruct` | Target model name |
| `TARGET_PROVIDER` | `groq` | Provider name for identification |
| `TARGET_BASE_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible API base URL |
| `TARGET_MAX_TOKENS` | `16384` | Maximum tokens limit |

### Setting Environment Variables

#### Via Wrangler CLI
```bash
wrangler secret put TARGET_MODEL
wrangler secret put TARGET_BASE_URL
```

#### Via Cloudflare Dashboard
1. Go to Workers & Pages → Your Worker → Settings → Variables
2. Add environment variables under "Environment Variables" section

### No Configuration Required

The proxy works out-of-the-box with default settings pointing to Groq's API. Just provide your API key in requests!

## 📚 API Usage

### Claude API Format

```bash
# Basic request
curl -X POST "https://your-worker.your-subdomain.workers.dev/v1/messages" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3.5-sonnet",
    "messages": [
      {
        "role": "user",
        "content": "Hello! Tell me about AI."
      }
    ],
    "max_tokens": 1024
  }'

# With tool calling
curl -X POST "https://your-worker.your-subdomain.workers.dev/v1/messages" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3.5-sonnet",
    "messages": [
      {
        "role": "user",
        "content": "What is the weather like?"
      }
    ],
    "tools": [
      {
        "name": "get_weather",
        "description": "Get current weather",
        "input_schema": {
          "type": "object",
          "properties": {
            "location": {"type": "string"}
          }
        }
      }
    ],
    "max_tokens": 1024
  }'
```

### Gemini API Format

```bash
# Basic Gemini request
curl -X POST "https://your-worker.your-subdomain.workers.dev/v1beta/models/gemini-1.5-flash:generateContent" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Hello! Tell me about AI."
          }
        ]
      }
    ],
    "generationConfig": {
      "maxOutputTokens": 1024,
      "temperature": 0.7
    }
  }'
```

### 📋 Available Endpoints

```bash
# Get Claude models
curl https://your-worker.your-subdomain.workers.dev/v1/models

# Get Gemini models
curl https://your-worker.your-subdomain.workers.dev/v1beta/models

# Get current configuration
curl https://your-worker.your-subdomain.workers.dev/v1/config

# Health check
curl https://your-worker.your-subdomain.workers.dev/
```

## 🎯 Supported API Formats

### Input Formats

| API Format | Endpoint | Models |
|------------|----------|--------|
| **Claude (Anthropic)** | `/v1/messages` | claude-4.0, claude-3.5-sonnet, claude-3-sonnet, claude-3-haiku, claude-3-opus |
| **Gemini (Google)** | `/v1beta/models/:model:generateContent` | gemini-2.5-flash, gemini-1.5-pro, gemini-1.5-flash, gemini-1.0-pro |

### Output Target

| Target Provider | Example Models | Base URL |
|-----------------|----------------|----------|
| **Groq** | moonshotai/kimi-k2-instruct, llama-3.1-70b-versatile | `https://api.groq.com/openai/v1` |
| **OpenAI** | gpt-4, gpt-3.5-turbo, gpt-4-turbo | `https://api.openai.com/v1` |
| **Custom** | Any OpenAI-compatible model | Your custom endpoint |

## 🔄 How It Works

### Data Flow

```
Claude/Gemini Request → Universal Proxy → OpenAI-Compatible Target → Response Conversion → Client
```

1. **Input**: Receive requests in Claude or Gemini API format
2. **Conversion**: Transform to OpenAI-compatible format
3. **Forwarding**: Send to configured target endpoint
4. **Response**: Convert response back to original API format
5. **Return**: Send formatted response to client

### Key Benefits

- 🔄 **API Unification**: Use any OpenAI-compatible service with Claude/Gemini clients
- 🎯 **Format Preservation**: Responses match the original API format exactly
- ⚡ **Real-time**: No caching ensures fresh responses
- 🔧 **Configurable**: Point to any OpenAI-compatible endpoint
- 🛠️ **Tool Support**: Full function/tool calling compatibility

## 🔧 Development Scripts

```bash
# Generate Cloudflare types
npm run cf-typegen

# Type checking
npm run type-check

# Linting
npm run lint
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
