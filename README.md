# Instagram Analytics Dashboard

An AI decision-support dashboard for Instagram: analytics, performance prediction,
comment sentiment, recommendations, "why did this post perform?" explanations, and anomaly alerts.

## Features
- KPI dashboard and interactive charts (Plotly)
- ML performance prediction (Random Forest)
- Comment sentiment and topic analysis (NLP: VADER)
- Next-content recommendation and 7-day plan (from historical data)
- Explainable post analysis and anomaly detection (z-score)

## Tech stack
Python, Pandas, NumPy, scikit-learn, NLTK/VADER, MySQL, SQLAlchemy, Flask,
HTML, CSS, JavaScript, jQuery, Bootstrap, Plotly

## Project structure
- `data/`: generated and cleaned datasets
- `notebooks/`: cleaning, ML training, sentiment analysis
- `sql/`: table scripts, analytics queries, database dump
- `models/`: trained ML models
- `app/`: Flask backend (`app.py`), `templates/`, `static/`

## How to run
1. Install Python 3.10+ and MySQL.
2. `python -m venv venv` then `venv\Scripts\activate`
3. `pip install -r requirements.txt`
4. Create the database: import `sql/instagram_ai_dump.sql` in MySQL Workbench.
5. `set DB_PASSWORD=your_mysql_password`
6. `python app\app.py` and open http://127.0.0.1:5000

## Notes and limitations
The dataset is synthetic (generated with `generate_data.py`) because the Instagram API
needs business-account approval. Topic effects in it are random; format, hour and
video-length effects are built in. Future work: real Instagram API data, XGBoost,
LLM-written insights, React frontend, A/B testing.