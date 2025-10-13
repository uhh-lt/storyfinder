from flask import Flask, request, jsonify
import os, requests, urllib.request

# Treat envs as BASE URLs (no path). Trailing slashes trimmed for safety.
REL_BASE = os.getenv('REL_URL',  'http://relation:9001').rstrip('/')
SUM_BASE = os.getenv('SUM_URL',  'http://summary:9002').rstrip('/')
CHAT_BASE = os.getenv('CHAT_URL', 'http://chat:9003').rstrip('/')

app = Flask(__name__)

def forward(url):
    try:
        r = requests.post(url, json=(request.get_json(silent=True) or {}), timeout=60)
        return (r.content, r.status_code, r.headers.items())
    except requests.exceptions.RequestException as e:
        print(f"[NLP] Error forwarding to {url}: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/health", methods=["HEAD", "GET"])
def health():
    urls = {
        "relation": f"{REL_BASE}/health",
        "summary":  f"{SUM_BASE}/health",
        "chat":     f"{CHAT_BASE}/health",
    }
    results = {}
    for name, url in urls.items():
        try:
            print(f"[HEALTH] checking {name} at {url}", flush=True)
            r = urllib.request.urlopen(url, timeout=3)
            results[name] = (r.status == 200)
            print(f"[HEALTH] {name} OK {r.status}", flush=True)
        except Exception as e:
            results[name] = False
            print(f"[HEALTH] {name} FAILED: {e}", flush=True)
    ok = all(results.values())
    return (jsonify({"ok": ok, "services": results}), 200 if ok else 503)

@app.route('/relation', methods=['POST'])
def relation():
    return forward(f"{REL_BASE}/relation")

@app.route('/summary', methods=['POST'])
def summary():
    return forward(f"{SUM_BASE}/summary")

@app.route('/chat', methods=['POST'])
def chat():
    return forward(f"{CHAT_BASE}/chat")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9000)
