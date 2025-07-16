/**
 * Universal AI API Proxy
 * Converts Claude and Gemini API requests to any OpenAI-compatible endpoint
 * 
 * Features:
 * - Claude API compatibility (/v1/messages)
 * - Gemini API compatibility (/v1beta/models/:model:generateContent)
 * - Configurable target model via environment variables
 * - Tool/function calling support
 * - No caching for real-time responses
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import OpenAI from 'openai'
import { v4 as uuidv4 } from 'uuid'

// Environment configuration interface
type Env = {
  TARGET_MODEL?: string        // Target model name (default: moonshotai/kimi-k2-instruct)
  TARGET_PROVIDER?: string     // Provider name (default: groq)
  TARGET_BASE_URL?: string     // API base URL (default: https://api.groq.com/openai/v1)
  TARGET_MAX_TOKENS?: string   // Max tokens limit (default: 16384)
}

const app = new Hono<{ Bindings: Env }>()

// Enable CORS for all routes
app.use('*', cors())

// Provider configuration interface
interface Provider {
  name: string
  baseURL: string
  models: string[]
  maxTokens: number
}


// Claude API interfaces
interface ContentBlock {
  type: 'text'
  text: string
}

interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, any>
}

interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: any
}

type MessageContent = string | Array<ContentBlock | ToolUseBlock | ToolResultBlock>

interface Message {
  role: 'user' | 'assistant'
  content: MessageContent
}

interface Tool {
  name: string
  description?: string
  input_schema: Record<string, any>
}

interface MessagesRequest {
  model: string
  messages: Message[]
  max_tokens?: number
  temperature?: number
  tools?: Tool[]
  tool_choice?: string | { type: string; name?: string }
}

// Gemini API interfaces
interface GeminiPart {
  text?: string
  inlineData?: {
    mimeType: string
    data: string
  }
  functionCall?: {
    name: string
    args: Record<string, any>
  }
  functionResponse?: {
    name: string
    response: Record<string, any>
  }
}

interface GeminiContent {
  role: string
  parts: GeminiPart[]
}

interface GeminiRequest {
  contents: GeminiContent[]
  generationConfig?: {
    temperature?: number
    maxOutputTokens?: number
    topP?: number
    topK?: number
  }
  tools?: Array<{
    function_declarations: Array<{
      name: string
      description: string
      parameters: Record<string, any>
    }>
  }>
}

/**
 * Get target configuration from environment variables
 */
function getTargetConfig(env: Env) {
  return {
    model: env.TARGET_MODEL || 'moonshotai/kimi-k2-instruct',
    provider: env.TARGET_PROVIDER || 'groq',
    baseURL: env.TARGET_BASE_URL || 'https://api.groq.com/openai/v1',
    maxTokens: parseInt(env.TARGET_MAX_TOKENS || '16384')
  }
}

/**
 * Create provider configuration from environment
 */
function createProvider(env: Env): Provider {
  const config = getTargetConfig(env)
  return {
    name: config.provider,
    baseURL: config.baseURL,
    models: [config.model],
    maxTokens: config.maxTokens
  }
}

/**
 * Extract API key from Authorization header or direct value
 */
function extractApiKey(authorization: string | undefined): string | null {
  if (!authorization) return null

  if (authorization.startsWith('Bearer ')) {
    return authorization.slice(7)
  }

  return authorization
}



/**
 * Convert Claude messages to OpenAI format
 */
function convertMessages(messages: Message[]): Array<{ role: string; content: string }> {
  return messages.map(m => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content }
    } else {
      const parts: string[] = []
      for (const block of m.content) {
        if (block.type === 'text') {
          parts.push(block.text)
        } else if (block.type === 'tool_use') {
          const toolInfo = `[Tool Use: ${block.name}] ${JSON.stringify(block.input)}`
          parts.push(toolInfo)
        } else if (block.type === 'tool_result') {
          console.log(`📥 Tool Result for ${block.tool_use_id}:`, JSON.stringify(block.content, null, 2))
          parts.push(`<tool_result>${JSON.stringify(block.content)}</tool_result>`)
        }
      }
      return { role: m.role, content: parts.join('\n') }
    }
  })
}

/**
 * Convert Claude tools to OpenAI format
 */
function convertTools(tools: Tool[]): Array<{ type: string; function: any }> {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: t.input_schema
    }
  }))
}

/**
 * Convert OpenAI tool calls back to Claude format
 */
function convertToolCallsToAnthropic(toolCalls: any[]): Array<ToolUseBlock> {
  const content: ToolUseBlock[] = []
  for (const call of toolCalls) {
    const fn = call.function
    const args = JSON.parse(fn.arguments)

    console.log(`🛠 Tool Call: ${fn.name}(${JSON.stringify(args, null, 2)})`)

    content.push({
      type: 'tool_use',
      id: call.id,
      name: fn.name,
      input: args
    })
  }
  return content
}

/**
 * Convert Gemini request to OpenAI format
 */
function convertGeminiToOpenAI(geminiRequest: GeminiRequest): { messages: any[], tools?: any[], max_tokens?: number, temperature?: number } {
  const messages: any[] = []
  
  // Convert Gemini contents to OpenAI messages
  for (const content of geminiRequest.contents) {
    const message: any = {
      role: content.role === 'model' ? 'assistant' : content.role,
      content: ''
    }
    
    const textParts: string[] = []
    const toolCalls: any[] = []
    
    for (const part of content.parts) {
      if (part.text) {
        textParts.push(part.text)
      } else if (part.functionCall) {
        toolCalls.push({
          id: `call_${Math.random().toString(36).substring(2, 15)}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args)
          }
        })
      }
    }
    
    if (textParts.length > 0) {
      message.content = textParts.join('\n')
    }
    
    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls
      if (!message.content) {
        message.content = null
      }
    }
    
    messages.push(message)
  }
  
  // Convert tools
  let tools: any[] | undefined
  if (geminiRequest.tools && geminiRequest.tools.length > 0) {
    tools = geminiRequest.tools.flatMap(tool => 
      tool.function_declarations.map(func => ({
        type: 'function',
        function: {
          name: func.name,
          description: func.description,
          parameters: func.parameters
        }
      }))
    )
  }
  
  return {
    messages,
    tools,
    max_tokens: geminiRequest.generationConfig?.maxOutputTokens,
    temperature: geminiRequest.generationConfig?.temperature
  }
}

/**
 * Convert OpenAI response back to Gemini format
 */
function convertOpenAIToGemini(openaiResponse: any, originalModel: string): any {
  const choice = openaiResponse.choices[0]
  const message = choice.message
  
  const parts: GeminiPart[] = []
  
  // Add text content
  if (message.content) {
    parts.push({ text: message.content })
  }
  
  // Add function calls
  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      const fn = toolCall.function
      parts.push({
        functionCall: {
          name: fn.name,
          args: JSON.parse(fn.arguments)
        }
      })
    }
  }
  
  return {
    candidates: [{
      content: {
        parts,
        role: 'model'
      },
      finishReason: choice.finish_reason === 'tool_calls' ? 'STOP' : 
                   choice.finish_reason === 'length' ? 'MAX_TOKENS' : 'STOP',
      index: 0
    }],
    usageMetadata: {
      promptTokenCount: openaiResponse.usage?.prompt_tokens || 0,
      candidatesTokenCount: openaiResponse.usage?.completion_tokens || 0,
      totalTokenCount: openaiResponse.usage?.total_tokens || 0
    },
    modelVersion: originalModel
  }
}


/**
 * Claude API endpoint - handles Anthropic-style requests
 */
app.post('/v1/messages', async (c) => {
  try {
    const authorization = c.req.header('Authorization') || c.req.header('x-api-key')
    const apiKey = extractApiKey(authorization)

    if (!apiKey) {
      return c.json({ error: 'Missing API key in Authorization header or x-api-key header' }, 401)
    }

    const request: MessagesRequest = await c.req.json()
    const provider = createProvider(c.env)
    const targetConfig = getTargetConfig(c.env)

    console.log(`🚀 Claude API → ${provider.name} | Model: ${request.model} → ${targetConfig.model}`)

    const openaiMessages = convertMessages(request.messages)
    const tools = request.tools ? convertTools(request.tools) : undefined

    const maxTokens = Math.min(
      request.max_tokens || provider.maxTokens,
      provider.maxTokens
    )

    if (request.max_tokens && request.max_tokens > provider.maxTokens) {
      console.log(`⚠️ Capping max_tokens from ${request.max_tokens} to ${provider.maxTokens}`)
    }

    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: provider.baseURL
    })

    const completion = await client.chat.completions.create({
      model: targetConfig.model,
      messages: openaiMessages as any,
      temperature: request.temperature,
      max_tokens: maxTokens,
      tools: tools as any,
      tool_choice: request.tool_choice as any,
      stream: false
    })

    // Handle non-streaming response
    const nonStreamCompletion = completion as any
    const choice = nonStreamCompletion.choices[0]
    const msg = choice.message

    let content: Array<ContentBlock | ToolUseBlock>
    let stopReason: string

    if (msg.tool_calls) {
      content = convertToolCallsToAnthropic(msg.tool_calls)
      stopReason = 'tool_use'
    } else {
      content = [{ type: 'text', text: msg.content || '' }]
      stopReason = 'end_turn'
    }

    const response = {
      id: `msg_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
      model: `${provider.name}/${request.model}`,
      role: 'assistant',
      type: 'message',
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: nonStreamCompletion.usage?.prompt_tokens || 0,
        output_tokens: nonStreamCompletion.usage?.completion_tokens || 0
      }
    }

    return c.json(response)
  } catch (error) {
    console.error('Proxy error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/**
 * Gemini API endpoint - handles Google Gemini-style requests (both streaming and non-streaming)
 */
app.post('/v1beta/models/:model\\:generateContent', async (c) => {
  try {
    const authorization = c.req.header('Authorization') || c.req.header('x-goog-api-key')
    const apiKey = extractApiKey(authorization)

    if (!apiKey) {
      return c.json({ error: 'Missing API key in Authorization header or x-goog-api-key header' }, 401)
    }

    const model = c.req.param('model')
    const geminiRequest: GeminiRequest = await c.req.json()
    const provider = createProvider(c.env)
    const targetConfig = getTargetConfig(c.env)

    console.log(`🚀 Gemini API → ${provider.name} | Model: ${model} → ${targetConfig.model}`)

    // Convert Gemini request to OpenAI format
    const { messages, tools, max_tokens, temperature } = convertGeminiToOpenAI(geminiRequest)

    const maxTokens = Math.min(
      max_tokens || provider.maxTokens,
      provider.maxTokens
    )

    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: provider.baseURL
    })

    const completion = await client.chat.completions.create({
      model: targetConfig.model,
      messages: messages as any,
      temperature: temperature,
      max_tokens: maxTokens,
      tools: tools as any,
      tool_choice: 'auto',
      stream: false
    })

    // Handle non-streaming response
    const nonStreamCompletion = completion as any
    const geminiResponse = convertOpenAIToGemini(nonStreamCompletion, model)

    return c.json(geminiResponse)
  } catch (error) {
    console.error('Gemini API error:', error)
    return c.json({ 
      error: { 
        code: 500, 
        message: 'Internal server error',
        status: 'INTERNAL'
      } 
    }, 500)
  }
})


/**
 * Gemini models endpoint - lists available Gemini models
 */
app.get('/v1beta/models', async (c) => {
  const targetConfig = getTargetConfig(c.env)
  
  const geminiModels = [
    'gemini-2.5-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-1.0-pro'
  ]

  const models = geminiModels.map(model => ({
    name: `models/${model}`,
    displayName: model,
    description: `${model} model proxied through ${targetConfig.provider}`,
    inputTokenLimit: targetConfig.maxTokens,
    outputTokenLimit: targetConfig.maxTokens,
    supportedGenerationMethods: ['generateContent'],
    target_model: targetConfig.model
  }))

  return c.json({
    models
  })
})

/**
 * Claude models endpoint - lists available Claude models
 */
app.get('/v1/models', async (c) => {
  const targetConfig = getTargetConfig(c.env)
  
  const claudeModels = [
    'claude-4.0',
    'claude-3.5-sonnet', 
    'claude-3-sonnet',
    'claude-3-haiku',
    'claude-3-opus'
  ]

  const models = claudeModels.map(model => ({
    id: model,
    object: 'model',
    provider: targetConfig.provider,
    max_tokens: targetConfig.maxTokens,
    target_model: targetConfig.model
  }))

  return c.json({
    object: 'list',
    data: models
  })
})

/**
 * Configuration endpoint - shows current proxy settings
 */
app.get('/v1/config', (c) => {
  const targetConfig = getTargetConfig(c.env)
  return c.json({
    current_config: {
      target_model: targetConfig.model,
      target_provider: targetConfig.provider,
      target_base_url: targetConfig.baseURL,
      target_max_tokens: targetConfig.maxTokens
    },
    environment_variables: {
      TARGET_MODEL: 'Target model to use (default: moonshotai/kimi-k2-instruct)',
      TARGET_PROVIDER: 'Target provider name (default: groq)',
      TARGET_BASE_URL: 'Target API base URL (default: https://api.groq.com/openai/v1)',
      TARGET_MAX_TOKENS: 'Maximum tokens limit (default: 16384)'
    }
  })
})


/**
 * Health check and info endpoint
 */
app.get('/', (c) => {
  return c.json({ 
    name: 'Universal AI API Proxy',
    message: 'Universal AI API Proxy is running 💡',
    version: '1.0.0',
    description: 'Proxy server that converts Claude and Gemini API requests to any OpenAI-compatible endpoint',
    features: [
      'Claude API compatibility',
      'Gemini API compatibility', 
      'Configurable target model via environment variables',
      'Tool/function calling support',
      'Real-time responses (no caching)',
      'CORS enabled'
    ],
    endpoints: {
      '/': 'This endpoint - health check and info',
      '/v1/messages': 'Claude API proxy endpoint',
      '/v1/models': 'List supported Claude models',
      '/v1beta/models/:model:generateContent': 'Gemini API proxy endpoint',
      '/v1beta/models': 'List supported Gemini models',
      '/v1/config': 'View current proxy configuration'
    },
    supported_apis: [
      'Claude (Anthropic)',
      'Gemini (Google)'
    ],
    github: 'https://github.com/your-username/universal-ai-proxy',
    license: 'MIT'
  })
})

export default app
