# 插画资源目录

占位说明：此目录用于存放真实插画资源，当前界面使用 CSS/SVG 手绘占位（见 src/components/PlaceholderArt.tsx）。

命名规范：
- npc-<物种id>.png    动物 NPC / 物种头像，如 npc-oriole.png（物种 id 取自 species.sample.json 的 id 字段）
- hall-bg.png         自然大厅场景背景图
- icon-<功能>.png     功能图标，如 icon-recognize.png

替换方式：把真图放入本目录后无需改页面代码——SpeciesAvatar 会优先加载 species.image 指向的路径，加载失败才回落占位。
