/**
 * Lightweight Zod-to-JSON-Schema converter for MCP tool registration.
 * FIX #12: Added ZodNullable, ZodDefault, safer type access with fallback.
 *
 * Note: This is only used as a reference/utility — server.ts now passes Zod shapes
 * directly to the MCP SDK. This converter remains for documentation/testing purposes.
 */

import type { z } from 'zod'

type JsonSchema = Record<string, unknown>

interface ZodDef {
  typeName?: string
  description?: string
  innerType?: z.ZodType
  schema?: z.ZodType
  type?: z.ZodType
  valueType?: z.ZodType
  items?: z.ZodType[]
  options?: z.ZodType[]
  values?: string[]
  checks?: Array<{ kind: string; value: number }>
  shape?: () => Record<string, z.ZodType>
}

function getDef(schema: z.ZodType): ZodDef {
  return (schema as unknown as { _def: ZodDef })._def ?? {}
}

export function zodToJsonSchema(schema: z.ZodType): JsonSchema {
  return convertZodType(schema)
}

function convertZodType(schema: z.ZodType): JsonSchema {
  const def = getDef(schema)
  const typeName = def.typeName ?? ''

  switch (typeName) {
    case 'ZodObject':
      return convertObject(def)
    case 'ZodString':
      return withDescription({ type: 'string' }, def)
    case 'ZodNumber':
      return convertNumber(def)
    case 'ZodBoolean':
      return withDescription({ type: 'boolean' }, def)
    case 'ZodEnum':
      return withDescription({ type: 'string', enum: def.values }, def)
    case 'ZodArray':
      return withDescription(
        { type: 'array', items: def.type ? convertZodType(def.type) : {} },
        def,
      )
    case 'ZodTuple':
      return withDescription(
        {
          type: 'array',
          items: (def.items ?? []).map((item) => convertZodType(item)),
          minItems: def.items?.length ?? 0,
          maxItems: def.items?.length ?? 0,
        },
        def,
      )
    case 'ZodOptional':
      return def.innerType ? convertZodType(def.innerType) : {}
    case 'ZodNullable':
      if (def.innerType) {
        const inner = convertZodType(def.innerType)
        return { ...inner, nullable: true }
      }
      return { nullable: true }
    case 'ZodDefault':
      return def.innerType ? convertZodType(def.innerType) : {}
    case 'ZodUnion':
      return withDescription(
        { anyOf: (def.options ?? []).map((opt) => convertZodType(opt)) },
        def,
      )
    case 'ZodRecord':
      return withDescription(
        {
          type: 'object',
          additionalProperties: def.valueType ? convertZodType(def.valueType) : {},
        },
        def,
      )
    case 'ZodEffects':
      return def.schema ? convertZodType(def.schema) : {}
    default:
      return {}
  }
}

function convertObject(def: ZodDef): JsonSchema {
  const shapeFn = def.shape
  if (!shapeFn) return { type: 'object' }

  const shape = shapeFn()
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    const innerDef = getDef(value)
    properties[key] = convertZodType(value)

    if (innerDef.description && !properties[key].description) {
      properties[key].description = innerDef.description
    }

    if (innerDef.typeName !== 'ZodOptional' && innerDef.typeName !== 'ZodDefault') {
      required.push(key)
    }
  }

  return withDescription(
    {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
    def,
  )
}

function convertNumber(def: ZodDef): JsonSchema {
  const result: JsonSchema = { type: 'number' }

  for (const check of def.checks ?? []) {
    if (check.kind === 'min') result.minimum = check.value
    if (check.kind === 'max') result.maximum = check.value
  }

  return withDescription(result, def)
}

function withDescription(schema: JsonSchema, def: ZodDef): JsonSchema {
  if (def.description) {
    return { ...schema, description: def.description }
  }
  return schema
}
