---
'larkard': patch
---

palette：低彩度图片按色相分组选择主体色，避免单个偏红高光决定整卡色相；图片中性色没有可见色相时，中性面和文字不再继承源卡彩度。renderer：interactive_container hover 保留自定义底色，只叠加 5% 明暗层，修复深色按钮 hover 变透明、白字消失。
