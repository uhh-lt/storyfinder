from flask import Flask, request, jsonify
from common import (
    client, build_prompt, MODEL_SUMMARY, TEMPERATURE_SUMMARY, SYSTEM_FILE_SUMMARY, USER_FILE_SUMMARY
)

app = Flask(__name__)
@app.route('/summary', methods=['POST'])
def summary():
    try:
        data = request.get_json()
        text = data.get("text", "")

        if not text.strip():
            return jsonify({"summary": "No text provided for summarization."}), 400

        prompt = build_prompt(SYSTEM_FILE_SUMMARY, USER_FILE_SUMMARY, text)

        print(prompt)

        response = client.chat.completions.create(
            model=MODEL_SUMMARY,
            messages=prompt,
            temperature=TEMPERATURE_SUMMARY,
        )

        summary = response.choices[0].message.content.strip()

        print("[NLP] Summary generated:")
        print(summary)

        return jsonify({
            "summary": summary
        })

    except Exception as e:
        print("[NLP] Error in /summary:", str(e))
        return jsonify({"error": str(e)}), 500
    
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True}), 200
    

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=9002)