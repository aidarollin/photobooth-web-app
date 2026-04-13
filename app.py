from flask import Flask, render_template

app = Flask(__name__)

# --- ROUTES ---
@app.route('/')
def index():
    # This serves the HTML file from the /templates folder
    return render_template('index.html')

if __name__ == '__main__':
    # Use 0.0.0.0 for hosting compatibility
    app.run(debug=True, host='0.0.0.0', port=5000)
