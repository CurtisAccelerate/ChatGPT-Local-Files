# path: ChatGPT-Server/chatgpt-local-server.py
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
import routes

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
app.logger.setLevel(logging.DEBUG)

@app.route('/', methods=['GET'])
def status():
    app.logger.debug("GET / status")
    return jsonify(routes.server_status())

@app.route('/execute', methods=['POST'])
def exec_py():
    payload = request.get_json(silent=True) or {}
    app.logger.debug(f"POST /execute payload: {payload}")
    result = routes.execute_code(payload.get('code', ''))
    app.logger.debug(f"/execute result: {result}")
    return jsonify(result)

@app.route('/execute_ps', methods=['POST'])
def exec_ps():
    payload = request.get_json(silent=True) or {}
    app.logger.debug(f"POST /execute_ps payload: {payload}")
    res = routes.execute_powershell(payload.get('command', ''), cwd=payload.get('cwd'))
    app.logger.debug(f"/execute_ps result: {res}")
    return jsonify(res)

@app.route('/execute_ps_stateful', methods=['POST'])
def exec_ps_stateful():
    payload = request.get_json(silent=True) or {}
    app.logger.debug(f"POST /execute_ps_stateful payload: {payload}")
    res = routes.execute_powershell_stateful(payload.get('command', ''))
    app.logger.debug(f"/execute_ps_stateful result: {res}")
    return jsonify(res)

@app.route('/save', methods=['POST'])
def exec_save():
    payload = request.get_json(silent=True) or {}
    app.logger.debug(f"POST /save payload: {payload}")
    return routes.api_save_file()

@app.route('/run', methods=['POST'])
def exec_run():
    payload = request.get_json(silent=True) or {}
    app.logger.debug(f"POST /run payload: {payload}")
    return routes.api_run_command()

@app.route('/list', methods=['POST'])
def list_dir():
    payload = request.get_json(silent=True) or {}
    app.logger.debug(f"POST /list payload: {payload}")
    return routes.api_list_dir()

@app.route('/open', methods=['POST'])
def open_file():
    payload = request.get_json(silent=True) or {}
    app.logger.debug(f"POST /open payload: {payload}")
    return routes.api_open_file()

@app.route('/peek', methods=['POST'])
def peek_file():
    payload = request.get_json(silent=True) or {}
    app.logger.debug(f"POST /peek payload: {payload}")
    return routes.api_peek_file()

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, threaded=True, debug=False)
