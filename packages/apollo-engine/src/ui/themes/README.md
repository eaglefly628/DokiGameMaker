# ZeroCraft UI 主题系统

## 设计理念

每套主题是一个**视觉风格完整统一的 UI 套装**。游戏 UI 的结构（血条、菜单、对话框）是固定的，视觉风格通过切换主题包改变。

主题素材可由 Claude Design / Claude Code 根据每套主题的 `spec.md` 中的生成 prompt 产出。

## 目录结构

```
themes/
├── theme.types.ts            # 主题接口（CSS tokens + 组件配置）
├── <theme-name>/
│   ├── spec.md               # 风格定义 + 色板 + 生成用 prompt
│   ├── tokens.css            # CSS 自定义属性
│   └── components/
│       ├── health-bar.css    # 血条
│       ├── button.css        # 按钮
│       ├── panel.css         # 面板/窗口
│       ├── dialog.css        # 对话框
│       ├── menu.css          # 菜单
│       ├── notification.css  # 通知横幅
│       ├── progress-bar.css  # 进度条
│       ├── tooltip.css       # 悬浮提示
│       ├── label.css         # 文字标签
│       ├── icon-badge.css    # 图标徽章
│       ├── inventory.css     # 背包/物品栏
│       ├── skill-slot.css    # 技能栏
│       ├── mini-map.css      # 小地图框
│       ├── avatar-frame.css  # 头像框
│       ├── name-plate.css    # 名牌/称号
│       ├── choice-option.css # 选项按钮（对话选择）
│       ├── tab-bar.css       # 标签栏
│       ├── slider.css        # 滑块
│       ├── modal.css         # 模态弹窗
│       └── toast.css         # 轻提示
```

## 组件命名规范（20 个标准组件）

### 核心组件（每个游戏几乎都用）

| 组件名 | 文件 | 说明 |
|--------|------|------|
| health-bar | health-bar.css | 血条/MP 条/体力条 |
| button | button.css | 通用按钮（主/次/危险） |
| panel | panel.css | 内容面板/窗口容器 |
| dialog | dialog.css | NPC 对话框 + 打字机文本区 |
| menu | menu.css | 垂直/水平菜单列表 |
| notification | notification.css | 顶部/底部通知横幅 |
| progress-bar | progress-bar.css | 加载进度/经验值条 |
| tooltip | tooltip.css | 悬浮信息提示 |
| label | label.css | 标题/正文/数字标签 |
| icon-badge | icon-badge.css | 图标 + 角标/数量 |

### 扩展组件（按游戏类型选用）

| 组件名 | 文件 | 适用类型 |
|--------|------|---------|
| inventory | inventory.css | RPG/冒险 |
| skill-slot | skill-slot.css | ARPG/MOBA |
| mini-map | mini-map.css | 开放世界/冒险 |
| avatar-frame | avatar-frame.css | 社交/乙游 |
| name-plate | name-plate.css | MMO/乙游 |
| choice-option | choice-option.css | 视觉小说/乙游 |
| tab-bar | tab-bar.css | 多页面系统 |
| slider | slider.css | 设置/音量 |
| modal | modal.css | 确认/警告弹窗 |
| toast | toast.css | 轻量即时反馈 |

## 主题列表（8 套）

| 主题 | 目录名 | 风格关键词 | 适合游戏类型 |
|------|--------|-----------|-------------|
| 极简暗色 | minimal-dark | 深色背景、低饱和、干净线条 | 通用/开发默认 |
| 赛博朋克 | cyberpunk | 霓虹、深蓝紫、故障艺术 | 科幻/动作 |
| 像素复古 | pixel-retro | 8-bit 边框、像素字体、CRT 滤镜 | 复古/独立 |
| 水墨国风 | ink-wash | 宣纸底纹、墨色渐变、毛笔笔触 | 国风/武侠 |
| 樱花乙女 | sakura-otome | 粉色系、柔光、花瓣装饰 | 乙游/恋爱 |
| 奇幻中世纪 | fantasy-medieval | 石纹/木纹、金属铆钉、羊皮纸 | RPG/冒险 |
| 科幻全息 | sci-fi-hologram | 透明层、蓝色光线、扫描线 | 太空/策略 |
| 毛玻璃现代 | glassmorphism | 半透明模糊、渐变边框、圆角 | 休闲/社交 |

## 使用方式

```typescript
// 1. 导入主题 tokens
import './themes/cyberpunk/tokens.css';

// 2. 组件自动继承 CSS 变量
// --theme-bg, --theme-text, --theme-accent, --theme-border, ...

// 3. 切换主题 = 替换 tokens.css 导入
```

## 生成工作流

1. 读取目标主题的 `spec.md`
2. 按 spec 中的色板和风格描述，用 Claude 生成每个组件的 CSS
3. 需要图片素材时（边框纹理、背景图案）用 Claude Design 生成
4. 放入对应 components/ 目录
