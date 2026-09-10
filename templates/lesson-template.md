.action{/* ============================================================
KB 课程模板 v1：拷贝本文件到 工作空间/data/templates/ 下，
在新课文档里输入 / 选择“模板”即可调用。
.action{/*注释*/} 行调用时不会渲染，只给人看。
纸条行 {: custom-...} 调用时会自动写成块属性，无需手贴。
============================================================ */}

## 课程正文

.action{/* 自由书写区，想到哪写到哪。单段不想入库就右键块标 → 属性，加 custom-kb-exclude=true */}

## 核心知识点

.action{/* 每行一个知识点，建议「标题：定义」格式（中文冒号） */}

- 行高：控制文本行与行之间的距离
- 对齐方式：决定文本在显示框内的位置

## 术语表

- string：显示的文本内容
- convertTouchToNodeSpaceAR：触摸坐标转节点本地坐标

## 复习卡片

{: custom-kb-exclude="true"}

.action{/* 上面这行纸条让整区不入库。卡片请用原生「块标菜单 → 闪卡」制卡，复习走 FSRS；制卡≠排除，知识点本身也可制卡 */}

- 行高是什么？答案：行与行之间的距离

老师强调：空字符串在原生平台可能闪退，务必判空！

{: custom-kb-include="true"}

.action{/* 上面这行把排除区里的金子单独救回来 */}

## 测验

{: custom-kb-exclude="true"}

- Q：string 为空会怎样？A：显示空白

## 本课已入库（自动更新）

.action{/* 原生 SQL 嵌入块：活查本文件中 custom-kb-status=active 的块，入库/改动后自动刷新，无需重新生成 */}

{{SELECT * FROM blocks WHERE root_id = '.action{.id}' AND ial LIKE '%custom-kb-status="active"%' AND type NOT IN ('d') ORDER BY created}}
