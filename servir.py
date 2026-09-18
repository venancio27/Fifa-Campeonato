# Servidor local do campeonato. Manda no-store em tudo: sem isso o navegador
# pode reaproveitar um .js antigo do cache e a tela fica meio velha, meio nova
# (foi o que travou o sorteio de desempate num teste).
import http.server, socketserver

PORTA = 8080

class SemCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('0.0.0.0', PORTA), SemCache) as s:
    print(f'Campeonato no ar: http://localhost:{PORTA}')
    s.serve_forever()
