<p align="center">
  <img src="./assets/icon.png" width="96" height="96" alt="静看 TV 图标" />
</p>

<h1 align="center">静看 TV</h1>

<p align="center">播放你自己添加的节目单。</p>
<p align="center">Android · iOS · React Native · Expo · TypeScript</p>

静看 TV 是一款面向 Android 和 iOS 的 IPTV 播放器，支持从链接或文件导入节目单，提供频道筛选、收藏、多线路切换和横屏播放。节目来源、频道、收藏、最近播放与偏好保存在本机，无需注册账号。

**应用不内置节目来源。** 请自行添加可信且有权使用的节目单。

[功能特色](#功能特色) · [快速使用](#快速使用) · [节目单格式](#节目单格式) · [开发运行](#开发运行) · [打包与安装](#打包与安装) · [代码结构](#代码结构)

## 功能特色

| 功能 | 说明 |
| --- | --- |
| 节目单导入 | 支持远程链接和本地 M3U / TXT 文件，兼容 UTF-8、GBK 编码，预览后保存 |
| 频道浏览 | 按名称搜索，按来源、分组、国家或地区、语言筛选 |
| 收藏与最近播放 | 收藏常看频道，从最近列表继续播放 |
| 多线路播放 | 按频道标识与地址合并线路，支持手动切换，连接超时或部分网络、媒体故障时自动尝试其他线路 |
| 播放操作 | 支持竖屏、横屏全屏、全屏频道列表、暂停、静音和进度拖动（限支持定位的内容） |
| 手势与浮窗 | 全屏左侧上下拖动调节亮度，右侧调节音量；支持应用内浮窗和设备支持时的系统画中画 |
| 后台播放 | 支持纯音频模式和后台播放，可在设置中调整 |
| 来源管理 | 编辑名称和链接或文件，启用、停用、删除来源，检测地址可用性 |

## 快速使用

1. 首次打开应用，选择「添加节目单链接」或「从文件导入」。
2. 输入链接或选择文件，可为来源设置名称。
3. 点击「预览」，确认频道信息后导入。
4. 在频道列表中搜索或筛选，点击频道开始播放。
5. 同一频道存在多个线路时，点击播放器中的「线路」打开底部面板进行选择。

联网操作需要应用内授权。频道台标默认关闭，可在「设置」中单独开启；导入时选择自动补全语言，会访问 iptv-org 的公开数据库。

## 节目单格式

### M3U

```m3u
#EXTM3U
#EXTINF:-1 tvg-id="Demo.cn" tvg-quality="720p" group-title="综合",示例频道
https://example.com/live/demo-sd.m3u8
#EXTINF:-1 tvg-id="Demo.cn" tvg-quality="1080p" group-title="综合",示例频道
https://example.com/live/demo-hd.m3u8
```

### TXT

```text
综合,#genre#
示例频道,https://example.com/live/demo.m3u8
```

以上地址仅用于展示格式，请替换为真实可访问的地址。多线路合并依赖可靠的频道标识或相同地址，不会仅凭相同频道名称合并。

- 单份节目单最多 **8 MiB、20,000 条**。
- 导入的是包含频道条目的节目单；单个频道的 HLS 播放清单不能直接作为频道列表导入。
- 网络地址仅接受 HTTP / HTTPS，不接受包含用户名密码、本机、局域网或其他特殊用途的地址。
- 视频格式、编码和画中画的实际支持情况取决于系统原生播放器及设备。

## 开发运行

### 环境准备

- Node.js **24.13.0 或更高版本**，使用 npm 管理依赖。
- Android：Android Studio、Android SDK 和 JDK，建议使用 JDK 21。
- iOS：macOS、Xcode 和 CocoaPods。

### 获取代码

```bash
git clone https://github.com/suijiafeng/jingkan-iptv-player.git
cd jingkan-iptv-player
npm ci
```

### Android

启动 Android 模拟器或连接已开启 USB 调试的设备，然后执行：

```bash
npm run android
```

### iOS

在 macOS 上执行，按提示选择模拟器：

```bash
npx expo run:ios
```

首次运行会生成对应平台的原生工程并构建应用。`android/` 和 `ios/` 为生成目录，原生配置通过 `app.json` 与 `plugins/` 维护。

后续需要单独启动 Metro 开发服务时：

```bash
npm start
```

### 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm start` | 启动 Expo / Metro 开发服务 |
| `npm run android` | 构建并运行 Android 应用 |
| `npx expo run:ios` | 构建并运行 iOS 应用 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 静态检查 |
| `npm run check` | 依次运行类型检查和静态检查 |
| `npm run prebuild` | 生成或更新 Android 原生工程 |
| `npm run build:bundle` | 导出 Android JavaScript 与资源，不生成 APK |
| `npm run brand:generate` | 生成应用品牌资源 |

### 技术栈

| 用途 | 技术 |
| --- | --- |
| 应用框架 | Expo 58、React Native 0.88、React 19 |
| 开发语言 | TypeScript 6，启用严格类型检查 |
| 应用入口 | Expo Router |
| 视频播放 | Expo Video |
| 本地数据 | Expo SQLite |
| 文件导入与处理 | Expo Document Picker、Expo File System |
| 横屏与亮度控制 | Expo Screen Orientation、Expo Brightness |

## 打包与安装

### Android APK

构建测试 APK：

```bash
npm run release:test
```

此命令用于生成测试安装包，并非单元测试。它不要求配置正式密钥，也不会自动升版；已有签名配置时使用该密钥，否则使用调试密钥。

首次正式打包前，由开发者本人创建并妥善保管签名密钥：

```bash
bash scripts/create-release-keystore.sh
```

脚本默认将密钥保存在仓库外的 `~/.jingkan/`，将签名配置写入 `~/.gradle/gradle.properties`。也可通过以下环境变量提供配置：

```text
JINGKAN_UPLOAD_STORE_FILE
JINGKAN_UPLOAD_STORE_PASSWORD
JINGKAN_UPLOAD_KEY_ALIAS
JINGKAN_UPLOAD_KEY_PASSWORD
```

在已提交且干净的工作区执行：

```bash
npm run release:check
npm run release:build
```

正式构建会自动递增补丁版本号和 Android `versionCode`。成功后，请审阅并提交 `app.json`、`package.json` 和 `package-lock.json` 中的版本变更；构建失败时会回滚本次升版。

当前发布脚本生成 **arm64-v8a APK**，产物位于 `release/`，附带 SHA-256 校验和、签名信息、构建信息及第三方依赖说明。签名密钥和密码应独立备份，同一应用后续覆盖升级需要使用相同签名。

### iOS 真机

1. 在 Xcode 中登录自己的 Apple 账号，连接并解锁 iPhone，完成设备信任及开发者模式设置。
2. 将 `app.json` 中的 `ios.appleTeamId` 改为自己的 Team ID；也可移除此字段，再在 Xcode 中选择团队。需要独立的应用标识时，同时调整 `ios.bundleIdentifier`。
3. 同步原生配置并运行：

```bash
npx expo prebuild --platform ios
npx expo run:ios --device
```

也可以在 Xcode 中打开生成的 `ios/TV.xcworkspace`，选择签名团队和目标设备后运行。仓库中的 `release:*` 脚本仅用于 Android，iOS 签名与分发通过 Xcode 处理。

## 本地资料与隐私

- 来源、频道、收藏、最近播放和偏好保存在设备本地，不要求登录账号。
- 地区识别参考系统地区、语言和时区，不通过 IP 查询或 GPS 定位。
- 节目来源联网、频道台标均有独立设置；台标和语言补全会访问对应的外部服务。
- JSON 备份包含来源、频道、收藏及部分偏好，不包含最近播放和联网、台标等许可。恢复备份会替换当前资料，并重置相关许可。
- 备份文件未加密，可能包含完整来源地址和令牌，请妥善保存。
- 当前备份导出依赖 Android 系统目录访问接口，iOS 尚未接入导出流程。

## 代码结构

```text
app/                  Expo Router 入口与应用布局
assets/               应用图标与品牌资源
plugins/              原生配置插件：隐私、品牌、签名、依赖清单
scripts/              资源生成、版本管理与 Android 发布脚本
src/
├── App.tsx           应用状态与功能组合
├── theme.ts          颜色、字号、间距等共享样式
├── components/       通用界面组件
├── data/             SQLite、数据仓库、导入与备份
├── domain/           节目单解析、频道标识、地址校验等领域逻辑
├── features/         频道、播放器、来源、设置、地区与首次引导
└── lib/              任务取消、流读取等工具
```

## 参与开发

提交改动前运行 `npm run check`。提交说明采用 `feat:`、`fix:`、`docs:` 等前缀，使用中文描述一个独立改动。

反馈问题时，请附上设备型号、系统版本、应用版本、复现步骤及必要截图。涉及节目源时，请先移除链接中的私人令牌或账号信息。
