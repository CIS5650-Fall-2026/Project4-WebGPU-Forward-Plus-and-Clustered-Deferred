// import { defineConfig } from 'vite'

// export default defineConfig({
//     build: {
//         target: 'esnext'
//     },
//     base: process.env.GITHUB_ACTIONS_BASE || undefined
// })

import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'esnext',
  },
  base: process.env.GITHUB_ACTIONS ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1]}/` : '/',
})