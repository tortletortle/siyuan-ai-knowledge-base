# K17-014 Label 组件使用详解（样例：人眼看到的样子）

> 本文件模拟它在思源里的渲染效果。
> `<!-- 纸条：... -->` 是给你看的标注，真实思源里这些纸条藏在
> “右键块标 → 属性”面板中，阅读界面完全看不见。
> `[✓ 已入库]` 徽标由 `snippets/kb-badges.css` 渲染（见下）。

## 课程正文

Label 是 Cocos 中用来显示文本的组件，最常用的属性是 string。

老师今天嗓子不舒服，大家担待一下。

<!-- 纸条：custom-kb-exclude="true"（闲聊不入库，贴在上面这一段上） -->

## 核心知识点

- 行高：控制文本行与行之间的距离 [✓ 已入库]

<!-- 纸条：custom-kb-status="active" custom-kb-id="k-014-lineheight" -->

- 对齐方式：决定文本在显示框内的位置 [✓ 已入库]

<!-- 纸条：custom-kb-status="active" custom-kb-id="k-014-align" -->

- string 为空会显示空白，原生平台务必判空 [✓ 已入库]

<!-- 纸条：custom-kb-status="active" custom-kb-id="k-014-empty" -->

## 术语表

- string：显示的文本内容 [✓ 已入库]
- convertTouchToNodeSpaceAR：触摸坐标转节点本地坐标（见 K17-009 坐标转换）

## 复习卡片

<!-- 纸条：custom-kb-exclude="true"（贴在标题上，整区排除） -->

- 行高是什么？答案：行与行之间的距离
- string 为空会怎样？答案：显示空白（原生平台可能闪退）

## 测验

<!-- 纸条：custom-kb-exclude="true"（贴在标题上，整区排除） -->

- Q：Label 如何换行？A：overflow 设为 SHRINK 或 SLICE
