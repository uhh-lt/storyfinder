from flask import Flask, request, jsonify
from common import (
    build_messages_with_files, build_chat_prompt, MODEL_CHAT, TEMPERATURE_CHAT, SYSTEM_FILE_CHAT, USER_FILE_CHAT, client
)

app = Flask(__name__)

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json() or {}
        question = (data.get("question") or "").strip()
        context  = (data.get("context")  or "").strip()
        history  = data.get("messages")  # expected: [{'role':'user'|'assistant', 'content':'...'}, ...]

        # Minimal validation: we need at least a question, and either context or history.
        if not question and not (isinstance(history, list) and len(history) > 0):
            return jsonify({"error": "Missing 'question'."}), 400

        messages = None

        if isinstance(history, list) and len(history) > 0:
            # History path WITH context + question awareness
            messages = build_messages_with_files(
                SYSTEM_FILE_CHAT,
                USER_FILE_CHAT,
                history_messages=history,
                context=context or "",
                question=question or ""
            )
        else:
            # Fallback: classic QA
            if not context:
                return jsonify({"error": "Missing 'context'."}), 400
            messages = build_chat_prompt(SYSTEM_FILE_CHAT, USER_FILE_CHAT, question, context)


        response = client.chat.completions.create(
            model=MODEL_CHAT,
            messages=messages,
            temperature=TEMPERATURE_CHAT
        )

        answer = (response.choices[0].message.content or "").strip()
        return jsonify({"answer": answer}), 200

    except Exception as e:
        print("[NLP] Error in /chat:", str(e))
        return jsonify({"error": str(e)}), 500
    
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True}), 200

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=9003)

