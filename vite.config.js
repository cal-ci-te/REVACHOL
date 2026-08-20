import { defineConfig, loadEnv } from "vite";
// ErrPulse 前端采集已禁用（SDK 无开关配置，注释即关闭）。需启用时取消注释。
// import errpulse from '@errpulse/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    
    // 后端地址配置
    const backendUrl = env.VITE_BACKEND_URL || 'http://127.0.0.1:9999';
    const wsBackendUrl = backendUrl.replace(/^http/, 'ws');

    return {
        plugins: [
            // polyfills 需要在 errpulse 之前
            nodePolyfills({
                include: ['crypto', 'buffer', 'stream', 'util'],
                globals: {
                    Buffer: true,
                    global: true,
                    process: true,
                },
            }),
            // ErrPulse 前端采集已禁用。需启用时取消下方注释。
            // errpulse({
            //     // enabled: mode === 'production',
            // }),
        ],
        
        // 根目录
        root: "./",
        
        // 开发服务器配置
        server: {
            port: 3000,
            host: '0.0.0.0', // 允许外部访问
            open: true, // 自动打开浏览器
            strictPort: false, // 端口被占用时尝试下一个
            cors: true, // 启用 CORS
            
            // 代理配置
            proxy: {
                // API 请求代理
                "/api": {
                    target: backendUrl,
                    changeOrigin: true,
                    secure: false,
                    timeout: 10000,
                    // 保留 /api 前缀（后端路由已包含 /api）
                    rewrite: (path) => path,
                    // 调试日志
                    configure: (proxy, options) => {
                        proxy.on('error', (err, req, res) => {
                            console.log('[Vite Proxy Error]', err.message);
                        });
                        proxy.on('proxyReq', (proxyReq, req, res) => {
                            console.log('[Vite Proxy]', req.method, req.url, '→', options.target + req.url);
                        });
                    },
                },
                
                // 上传文件代理
                "/uploads": {
                    target: backendUrl,
                    changeOrigin: true,
                    secure: false,
                },
                
                // WebSocket 代理
                "/websocket": {
                    target: backendUrl,
                    ws: true,
                },
            },
            
            // HMR 配置
            hmr: {
                overlay: true,
                // 在 Docker 环境中需要配置
                // clientPort: 3000,
                // host: 'localhost',
            },
            
            // 文件监听配置（Docker/WSL 环境需要）
            watch: {
                usePolling: true,
                interval: 2000,
                // 排除不需要监听的目录
                ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
            },
        },
        
        // 预览服务器配置
        preview: {
            port: 3000,
            host: '0.0.0.0',
            strictPort: true,
        },
        
        // 构建配置
        build: {
            outDir: "dist",
            assetsDir: "assets",
            sourcemap: false,
            minify: "esbuild",
            // 启用 CSS 代码分割
            cssCodeSplit: true,
            // 启用 brotli 压缩
            brotliSize: true,
            // chunk 大小警告阈值
            chunkSizeWarningLimit: 1000,
            
            rollupOptions: {
                input: {
                    main: "index.html",
                    crewDashboard: "crew-dashboard.html",
                    // 如果有其他页面，在这里添加
                    // editor: "article-editor.html",
                },
                output: {
                    entryFileNames: 'js/[name].[hash].js',
                    chunkFileNames: 'js/[name].[hash].js',
                    assetFileNames: 'assets/[name].[hash].[ext]',
                    // 手动分包优化
                    manualChunks: {
                        // 预留：将第三方库分离到单独的 chunk
                        // vendor: ['lodash', 'dayjs'],
                    },
                },
                // 外部依赖（如果使用 CDN）
                external: [],
            },
            
            // 构建前清理输出目录
            emptyOutDir: true,
        },
        
        // 全局变量定义
        define: {
            "import.meta.env.VITE_API_BASE_URL": JSON.stringify(
                env.VITE_API_BASE_URL || ""
            ),
            // 支持 Node.js 全局变量
            "global": "globalThis",
            "process.env.NODE_ENV": JSON.stringify(mode),
        },
        
        // CSS 配置
        css: {
            // CSS 模块配置
            modules: {
                localsConvention: 'camelCase',
                generateScopedName: '[name]__[local]___[hash:base64:5]',
            },
            // 预处理器选项
            preprocessorOptions: {
                scss: {
                    additionalData: `@import "./css/variables.css";`,
                },
            },
        },
        
        // 解析配置
        resolve: {
            alias: {
                // 简化导入路径
                '@': '/js',
                '@css': '/css',
                '@utils': '/js/utils',
                '@services': '/js/services',
                '@components': '/js/ui/components',
                '@core': '/js/core',
            },
            // 文件扩展名优先级
            extensions: ['.js', '.css', '.json'],
        },
        
        // 优化依赖预构建
        optimizeDeps: {
            include: [
                // 'lodash',
                // 'dayjs',
                // 预构建可能会用到的依赖
            ],
            exclude: [],
        },
        
        // 测试配置
        test: {
            environment: "jsdom",
            globals: true,
            setupFiles: ['./tests/setup.js'],
            coverage: {
                provider: "v8",
                reporter: ["text", "html", "json"],
                include: ["js/**/*.js"],
                exclude: [
                    "js/**/*.test.js",
                    "js/**/*.spec.js",
                    "**/node_modules/**",
                    "**/dist/**",
                    "**/tests/**",
                ],
                thresholds: {
                    statements: 70,
                    branches: 70,
                    functions: 70,
                    lines: 70,
                },
            },
            // 测试文件匹配模式
            include: ['tests/**/*.test.js', 'js/**/*.test.js'],
            // 测试超时时间
            testTimeout: 10000,
        },
        
        // 开发环境下，ESLint 错误显示在浏览器
        esbuild: {
            // 保留 console.log（生产环境会移除）
            drop: mode === 'production' ? ['console', 'debugger'] : [],
            // 在开发环境显示源码位置
            sourcemap: mode !== 'production',
        },
        
        // 环境变量前缀
        envPrefix: ['VITE_', 'REVACHOL_'],
    };
});