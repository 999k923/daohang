<img width="1157" height="562" alt="image" src="https://github.com/user-attachments/assets/3843151f-2cf8-4a54-a0f0-96501f1acbe4" />

# 实现前端管理，登录账号就有操作权限，不登录可以访问不能编辑。

部署流程
==
假设新站域名 nav2.xxx.com，端口用 21190 。

目录建议：

前端：inde.html (放到网站的主目录下）

后端：/opt/nav2/nav-api/（放 server.js + package.json 等）

数据：/opt/nav2/nav-data/（SQLite 保存位置）

## 1）在 VPS 创建目录并放代码
```bash
mkdir -p /opt/nav2/site /opt/nav2/nav-api /opt/nav2/nav-data
```
把你的文件放进去：

后端代码（server.js、package.json…）→ /opt/nav2/nav-api/

## 2）变量解释（不用改代码，只看配置）

你后端要用环境变量：

PORT=21190

DB_PATH=/data/data.sqlite

ADMIN_USER=admin

ADMIN_PASS=你要的新密码（建议改）

SQLite 会写入挂载目录：/opt/nav2/nav-data/data.sqlite
## 3）1Panel 创建 Docker 编排compose（nav2-api）账号密码自己修改
```bash
version: "3.8"
services:
  nav2-api:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - /opt/nav2/nav-api:/app
      - /opt/nav2/nav-data:/data
    environment:
      PORT: "21190"
      DB_PATH: "/data/data.sqlite"
      ADMIN_USER: "admin"
      ADMIN_PASS: "admin123456"
      TOKEN_TTL_HOURS: "168"
    command: sh -c "npm i && node server.js"
    restart: unless-stopped
    ports:
      - "127.0.0.1:21190:21190"
```
注意：ports 用 127.0.0.1:21190:21190，只在本机监听，安全。
启动编排后，先本机验证：
```bash
curl -i http://127.0.0.1:21190/api/data
```
看到 HTTP/1.1 200 OK 就说明后端 OK。
## 4）创建新网站（nav2 域名）
反向代理规则;
进入这个网站 → 反向代理 → 新增规则：

前端请求路径：/api/

后端代理地址：http://127.0.0.1:21190/
保存并启用。

然后用域名验证 API：

打开：

https://nav2.xxx.com/api/data

应该返回 JSON（空也正常）。

## 上线验证（最终）
1.打开 https://nav2.xxx.com/

2.点击登录：admin / 密码

3.新增分类/网站

4.刷新页面数据仍在

5.换设备访问数据仍在（数据库同步成功）
