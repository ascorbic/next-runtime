import type { NetlifyConfig, NetlifyPluginConstants } from '@netlify/build'
import { copyFile, ensureDir, writeFile, writeJSON } from 'fs-extra'
import { join, relative } from 'pathe'

import { HANDLER_FUNCTION_NAME, ODB_FUNCTION_NAME, IMAGE_FUNCTION_NAME } from '../constants'
import getHandler from '../templates/getHandler'
import { getPageResolver } from '../templates/getPageResolver'

const DEFAULT_FUNCTIONS_SRC = 'netlify/functions'

export const generateFunctions = async (
  { FUNCTIONS_SRC = DEFAULT_FUNCTIONS_SRC, INTERNAL_FUNCTIONS_SRC, PUBLISH_DIR }: NetlifyPluginConstants,
  appDir: string,
): Promise<void> => {
  const functionsDir = INTERNAL_FUNCTIONS_SRC || FUNCTIONS_SRC
  const bridgeFile = require.resolve('@vercel/node/dist/bridge')

  const functionDir = join(process.cwd(), functionsDir, HANDLER_FUNCTION_NAME)
  const publishDir = relative(functionDir, join(process.cwd(), PUBLISH_DIR))

  const writeHandler = async (func, isODB) => {
    const handlerSource = await getHandler({ isODB, publishDir, appDir: relative(functionDir, appDir) })
    await ensureDir(join(functionsDir, func))
    await writeFile(join(functionsDir, func, `${func}.js`), handlerSource)
    await copyFile(bridgeFile, join(functionsDir, func, 'bridge.js'))
  }

  await writeHandler(HANDLER_FUNCTION_NAME, false)
  await writeHandler(ODB_FUNCTION_NAME, true)
}

/**
 * Writes a file in each function directory that contains references to every page entrypoint.
 * This is just so that the nft bundler knows about them. We'll eventually do this better.
 */
export const generatePagesResolver = async ({
  constants: { INTERNAL_FUNCTIONS_SRC, FUNCTIONS_SRC = DEFAULT_FUNCTIONS_SRC },
  netlifyConfig,
  target,
}: {
  constants: NetlifyPluginConstants
  netlifyConfig: NetlifyConfig
  target?: string
}): Promise<void> => {
  const functionsPath = INTERNAL_FUNCTIONS_SRC || FUNCTIONS_SRC

  const jsSource = await getPageResolver({
    netlifyConfig,
    target,
  })

  await writeFile(join(functionsPath, ODB_FUNCTION_NAME, 'pages.js'), jsSource)
  await writeFile(join(functionsPath, HANDLER_FUNCTION_NAME, 'pages.js'), jsSource)
}

export const setupImageFunction = async ({
  constants: { INTERNAL_FUNCTIONS_SRC, FUNCTIONS_SRC = DEFAULT_FUNCTIONS_SRC },
  imageconfig = {},
  netlifyConfig,
  basePath,
}: {
  constants: NetlifyPluginConstants
  imageconfig?: Record<string, any>
  netlifyConfig: NetlifyConfig
  basePath?: string
}): Promise<void> => {
  const functionsPath = INTERNAL_FUNCTIONS_SRC || FUNCTIONS_SRC
  const functionName = `${IMAGE_FUNCTION_NAME}.js`
  const functionDirectory = join(functionsPath, IMAGE_FUNCTION_NAME)

  await ensureDir(functionDirectory)
  await writeJSON(join(functionDirectory, 'imageconfig.json'), {
    ...imageconfig,
    basePath: [basePath, IMAGE_FUNCTION_NAME].join('/'),
  })
  await copyFile(join(__dirname, '..', 'templates', 'ipx.js'), join(functionDirectory, functionName))

  const imagePath = imageconfig.path || '/_next/image'

  netlifyConfig.redirects.push(
    {
      from: `${imagePath}*`,
      query: { url: ':url', w: ':width', q: ':quality' },
      to: `${basePath}/${IMAGE_FUNCTION_NAME}/w_:width,q_:quality/:url`,
      status: 301,
    },
    {
      from: `${basePath}/${IMAGE_FUNCTION_NAME}/*`,
      to: `/.netlify/builders/${IMAGE_FUNCTION_NAME}`,
      status: 200,
    },
  )

  if (basePath) {
    // next/image generates image static URLs that still point at the site root
    netlifyConfig.redirects.push({
      from: '/_next/static/image/*',
      to: '/static/image/:splat',
      status: 200,
    })
  }
}