import { app, shell, BrowserWindow, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { statSync, createReadStream } from 'node:fs'

const VIDEO_FILE_PATH = join(__dirname, '../../example_video.mp4')

const RANGE_RE = /bytes=(\d+)-(\d+)?/

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'exampleproto', privileges: { bypassCSP: true, standard: true, stream: true } }
])

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  protocol.handle('exampleproto', (request) => {
    console.log('Request received to exampleproto handler')

    // Get the size of the file on disk
    const fileSize = statSync(VIDEO_FILE_PATH).size
    console.log(`The video file is ${fileSize} bytes in size`)

    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Range
    const range = request.headers.get('Range')

    if (range === null) {
      // Return the entire file without Range headers, but as a stream
      return new Response(createReadStream(VIDEO_FILE_PATH), {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': fileSize.toString(),
          // This may not be needed
          'Cache-Control': 'no-cache'
        }
      })
    } else {
      const matches = range.match(RANGE_RE)

      if (matches === null) throw new Error('Invalid Range header')

      const start = parseInt(matches[1])
      const end = matches[2] === undefined ? fileSize - 1 : parseInt(matches[2])
      const contentLength = end - start + 1

      console.log(`Returning data from byte ${start} to byte ${end} as requested`)

      // Return the requested range of the file with Range headers, but as a stream
      return new Response(createReadStream(VIDEO_FILE_PATH, { start, end }), {
        // Note the 206 status instead of 200
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          // This is how many bytes of the video we are returning in this response
          'Content-Length': contentLength,
          // This indicates that the server understands range requests
          'Accept-Ranges': 'bytes',
          // This indicates which portion of the file is being sent, and the total size of the file
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          // This may not be needed
          'Cache-Control': 'no-cache'
        }
      })
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
