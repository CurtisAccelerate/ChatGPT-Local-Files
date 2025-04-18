# path: ChatGPT-Local-Files/server.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import routes

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

@app.route('/', methods=['GET'])
def status():
    return jsonify(routes.server_status())

@app.route('/execute', methods=['POST'])
def exec_py():
    code = (request.json or {}).get('code', '')
    return jsonify(routes.execute_code(code))

@app.route('/execute_ps', methods=['POST'])
def exec_ps():
    data = request.json or {}
    return jsonify(routes.execute_powershell(data.get('command', ''), cwd=data.get('cwd')))

@app.route('/execute_ps_stateful', methods=['POST'])
def exec_ps_stateful():
    cmd = (request.json or {}).get('command', '')
    return jsonify(routes.execute_powershell_stateful(cmd))

@app.route('/save', methods=['POST'])
def exec_save():
    return routes.api_save_file()

@app.route('/run', methods=['POST'])
def exec_run():
    return routes.api_run_command()

if __name__ == '__main__':
    # Launch development server
    app.run(host='127.0.0.1', port=5000, threaded=True)
