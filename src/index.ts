import { join, relative } from 'path'

import type { NetlifyPlugin } from '@netlify/build'

import { ODB_FUNCTION_NAME } from './constants'
import { restoreCache, saveCache } from './helpers/cache'
import { getNextConfig, configureHandlerFunctions, generateRedirects } from './helpers/config'
import { moveStaticPages, movePublicFiles } from './helpers/files'
import { generateFunctions, setupImageFunction, generatePagesResolver } from './helpers/functions'
import {
  verifyNetlifyBuildVersion,
  checkNextSiteHasBuilt,
  checkForRootPublish,
  logBetaMessage,
  checkZipSize,
} from './helpers/verification'

module.exports = {
  async onPreBuild({
    constants,
    netlifyConfig,
    utils: {
      build: { failBuild },
      cache,
    },
  }) {
    logBetaMessage()
    const { publish } = netlifyConfig.build
    checkForRootPublish({ publish, failBuild })
    verifyNetlifyBuildVersion({ failBuild, ...constants })

    await restoreCache({ cache, publish })

    netlifyConfig.build.environment ||= {}
    // eslint-disable-next-line unicorn/consistent-destructuring
    netlifyConfig.build.environment.NEXT_PRIVATE_TARGET = 'server'
  },

  async onBuild({
    constants,
    netlifyConfig,
    utils: {
      build: { failBuild },
    },
  }) {
    const { publish } = netlifyConfig.build

    checkNextSiteHasBuilt({ publish, failBuild })

    const { appDir, basePath, i18n, images, target, ignore } = await getNextConfig({ publish, failBuild })

    configureHandlerFunctions({ netlifyConfig, ignore, publish: relative(process.cwd(), publish) })

    await generateFunctions(constants, appDir)
    await generatePagesResolver({ netlifyConfig, target, constants })

    await movePublicFiles({ appDir, publish })

    if (process.env.EXPERIMENTAL_MOVE_STATIC_PAGES) {
      await moveStaticPages({ target, failBuild, netlifyConfig, i18n })
    }

    await setupImageFunction({ constants, imageconfig: images, netlifyConfig, basePath })

    await generateRedirects({
      netlifyConfig,
      basePath,
      i18n,
    })
  },

  async onPostBuild({ netlifyConfig, utils: { cache }, constants: { FUNCTIONS_DIST } }) {
    await saveCache({ cache, publish: netlifyConfig.build.publish })
    await checkZipSize(join(FUNCTIONS_DIST, `${ODB_FUNCTION_NAME}.zip`))
  },

  onEnd() {
    logBetaMessage()
  },
} as NetlifyPlugin