# Scripts

后续步骤中的一次性数据维护脚本放在此目录；数据库结构变更必须使用 `migrations/`。

- `verify-database.mjs`：在系统临时目录创建隔离 local D1，验证空库 migration、seed、约束、重复访问及级联删除，结束后删除临时状态。
