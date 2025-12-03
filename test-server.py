# 간단한 테스트 스크립트
# admin.html이 제대로 작동하는지 확인

import http.server
import socketserver
import os

PORT = 8000
os.chdir(r'd:\Github\Status-of-professors')

Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"서버 시작: http://localhost:{PORT}")
    print(f"관리자 페이지: http://localhost:{PORT}/admin.html")
    print("Ctrl+C로 종료")
    httpd.serve_forever()
