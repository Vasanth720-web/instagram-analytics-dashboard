import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, render_template, request
from sqlalchemy import create_engine

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent

# Password comes from an environment variable, so it is never stored in code
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
engine = create_engine(
    f"mysql+pymysql://root:{DB_PASSWORD}@localhost:3306/instagram_ai?charset=utf8mb4"
)

# Trained ML models (saved from the 03_ml_model notebook)
clf = joblib.load(BASE_DIR / "models" / "performance_classifier.pkl")
reg = joblib.load(BASE_DIR / "models" / "reach_regressor.pkl")
feature_cols = joblib.load(BASE_DIR / "models" / "feature_columns.pkl")

POST_TYPES = ["Reel", "Carousel", "Image"]
TOPICS = ["Python Tips", "Python Interview Tips", "SQL Tutorial", "Data Analysis",
          "Machine Learning Basics", "Career Advice", "Excel Tricks"]

DUR_BINS = [0, 19, 40, 60]
DUR_LABELS = ["15-19", "20-40", "41-60"]


def query(sql):
    return pd.read_sql(sql, engine)


def pct_diff(value, baseline):
    return round((float(value) - float(baseline)) / float(baseline) * 100, 1) if baseline else 0.0


def best_duration_bucket(df):
    reels = df[df["post_type"] == "Reel"].copy()
    reels["bucket"] = pd.cut(reels["video_duration"], bins=DUR_BINS, labels=DUR_LABELS)
    return str(reels.groupby("bucket", observed=True)["reach_ratio"].mean().idxmax())


# ---------------------------------------------------------------- pages
@app.route("/")
def home():
    return render_template("index.html")


# ---------------------------------------------------------------- dashboard data
@app.route("/api/kpis")
def kpis():
    df = query("SELECT * FROM posts ORDER BY post_date")
    reel_reach = df.loc[df["post_type"] == "Reel", "reach"].sum()

    data = {
        "followers": int(df["followers"].iloc[-1]),
        "follower_growth": int(df["followers"].iloc[-1] - df["followers"].iloc[0]),
        "total_reach": int(df["reach"].sum()),
        "total_impressions": int(df["impressions"].sum()),
        "avg_engagement_rate": round(float(df["engagement_rate"].mean()), 2),
        "total_likes": int(df["likes"].sum()),
        "total_comments": int(df["comments"].sum()),
        "total_shares": int(df["shares"].sum()),
        "total_saves": int(df["saves"].sum()),
        "reel_reach_share": round(float(reel_reach / df["reach"].sum() * 100), 1),
    }
    return jsonify(data)


@app.route("/api/charts")
def charts():
    by_type = query("""
        SELECT post_type,
               ROUND(AVG(reach)) AS avg_reach,
               ROUND(AVG(save_rate), 2) AS avg_save_rate,
               ROUND(AVG(share_rate), 2) AS avg_share_rate
        FROM posts GROUP BY post_type
    """)
    monthly = query("""
        SELECT post_month, MAX(followers) AS followers
        FROM posts GROUP BY post_month ORDER BY post_month
    """)
    hourly = query("""
        SELECT posting_hour, ROUND(AVG(reach_ratio), 2) AS avg_reach_ratio
        FROM posts GROUP BY posting_hour ORDER BY posting_hour
    """)

    return jsonify({
        "by_type": by_type.to_dict(orient="records"),
        "monthly_followers": monthly.to_dict(orient="records"),
        "hourly": hourly.to_dict(orient="records"),
    })


# ---------------------------------------------------------------- ML prediction
@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        d = request.get_json()
        post_type = d["post_type"]
        topic = d["topic"]
        if post_type not in POST_TYPES or topic not in TOPICS:
            return jsonify({"error": "Invalid post type or topic"}), 400

        # Build one row with the same columns the model was trained on
        row = {c: 0 for c in feature_cols}
        row["video_duration"] = int(d["video_duration"]) if post_type == "Reel" else 0
        row["posting_hour"] = int(d["posting_hour"])
        row["hashtags_count"] = int(d["hashtags_count"])
        row["caption_length"] = int(d["caption_length"])
        row["post_type_" + post_type] = 1
        row["topic_" + topic] = 1
        X = pd.DataFrame([row])[feature_cols]

        # Performance level + probabilities
        level = str(clf.predict(X)[0])
        probs = {str(c): round(float(p) * 100, 1)
                 for c, p in zip(clf.classes_, clf.predict_proba(X)[0])}

        # Reach range from the spread of the forest's individual trees
        tree_preds = np.array([t.predict(X.values)[0] for t in reg.estimators_])
        ratio = float(reg.predict(X)[0])
        low_ratio, high_ratio = np.percentile(tree_preds, [10, 90])

        followers = int(query(
            "SELECT followers FROM posts ORDER BY post_date DESC LIMIT 1"
        )["followers"].iloc[0])

        hist = query(
            f"SELECT AVG(engagement_rate) AS e FROM posts WHERE post_type = '{post_type}'"
        )["e"].iloc[0]

        return jsonify({
            "performance": level,
            "probabilities": probs,
            "expected_reach": int(ratio * followers),
            "reach_low": int(low_ratio * followers),
            "reach_high": int(high_ratio * followers),
            "followers": followers,
            "typical_engagement": round(float(hist), 2),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ---------------------------------------------------------------- comment sentiment
@app.route("/api/sentiment")
def sentiment():
    s = query("""SELECT sentiment, COUNT(*) AS n FROM comments
                 WHERE sentiment IS NOT NULL GROUP BY sentiment""")
    total = int(s["n"].sum())
    if total == 0:
        return jsonify({"error": "Run the 04_sentiment notebook first"}), 400

    counts = {row.sentiment: int(row.n) for row in s.itertuples()}
    percent = {k: round(v / total * 100, 1) for k, v in counts.items()}

    topics = query("""SELECT topic, COUNT(*) AS n FROM comments
                      WHERE topic IS NOT NULL GROUP BY topic ORDER BY n DESC""")
    neg = query("""SELECT comment_text, COUNT(*) AS n FROM comments
                   WHERE sentiment = 'Negative'
                   GROUP BY comment_text ORDER BY n DESC LIMIT 5""")

    return jsonify({
        "total": total,
        "counts": counts,
        "percent": percent,
        "topics": [{"topic": r.topic, "n": int(r.n)} for r in topics.itertuples()],
        "negative_samples": [{"text": r.comment_text, "n": int(r.n)} for r in neg.itertuples()],
    })


# ---------------------------------------------------------------- explanations and recommendations
@app.route("/api/recent_posts")
def recent_posts():
    df = query("""SELECT post_id, post_date, post_type, topic FROM posts
                  ORDER BY post_date DESC LIMIT 15""")
    return jsonify([
        {"post_id": int(r.post_id),
         "label": f"#{r.post_id} · {r.post_date} · {r.post_type} · {r.topic}"}
        for r in df.itertuples()
    ])


@app.route("/api/explain/<int:post_id>")
def explain(post_id):
    df = query("SELECT * FROM posts")
    row = df[df["post_id"] == post_id]
    if row.empty:
        return jsonify({"error": "Post not found"}), 404

    p = row.iloc[0]
    same = df[df["post_type"] == p["post_type"]]
    points = []

    def add(good, text):
        points.append({"good": bool(good), "text": text})

    def compare(label, col):
        d = pct_diff(p[col], same[col].mean())
        word = "above" if d >= 0 else "below"
        add(d >= 0, f"{label} was {abs(d)}% {word} your average {p['post_type']}.")

    compare("Reach (relative to followers)", "reach_ratio")
    compare("Save rate", "save_rate")
    compare("Share rate", "share_rate")
    compare("Engagement rate", "engagement_rate")

    best_hours = df.groupby("posting_hour")["reach_ratio"].mean().nlargest(4).index.tolist()
    hour = int(p["posting_hour"])
    listed = ", ".join(f"{int(h)}:00" for h in sorted(best_hours))
    add(hour in best_hours,
        f"Posted at {hour}:00, which {'is' if hour in best_hours else 'is not'} "
        f"one of your 4 best hours for reach ({listed}).")

    if p["post_type"] == "Reel":
        best_bucket = best_duration_bucket(df)
        mine = str(pd.cut([int(p["video_duration"])], bins=DUR_BINS, labels=DUR_LABELS)[0])
        add(mine == best_bucket,
            f"Video length of {int(p['video_duration'])} sec is "
            f"{'inside' if mine == best_bucket else 'outside'} your best-performing range ({best_bucket} sec).")

    good = sum(1 for x in points if x["good"])
    return jsonify({
        "post": {"post_id": int(p["post_id"]), "date": str(p["post_date"]),
                 "type": p["post_type"], "topic": p["topic"],
                 "reach": int(p["reach"]), "level": str(p["performance_level"])},
        "points": points,
        "summary": f"{good} of {len(points)} factors were in this post's favour.",
    })


@app.route("/api/recommend")
def recommend():
    df = query("SELECT * FROM posts ORDER BY post_date")
    df["sr"] = df["share_rate"] + df["save_rate"]
    overall_reach = df["reach_ratio"].mean()

    ts = df.groupby("post_type").agg(
        reach=("reach_ratio", "mean"), save=("save_rate", "mean"), share=("share_rate", "mean"))
    order = ts["reach"].sort_values(ascending=False).index.tolist()
    best_type = order[0]

    def topics_for(t):
        return df[df["post_type"] == t].groupby("topic")["sr"].mean().sort_values(ascending=False)

    best_topics = topics_for(best_type)
    best_topic = best_topics.index[0]
    topic_gain = pct_diff(best_topics.iloc[0], df[df["post_type"] == best_type]["sr"].mean())

    hours = sorted(int(h) for h in df.groupby("posting_hour")["reach_ratio"].mean().nlargest(3).index)
    window = f"{hours[0]}:00–{hours[-1] + 1}:00"

    recent = df.tail(30)
    gaps = {
        "Reach": pct_diff(recent["reach_ratio"].mean(), df["reach_ratio"].mean()),
        "Saves": pct_diff(recent["save_rate"].mean(), df["save_rate"].mean()),
        "Shares": pct_diff(recent["share_rate"].mean(), df["share_rate"].mean()),
    }
    objective = min(gaps, key=gaps.get)

    fmt_text = f"{best_type} ({best_duration_bucket(df)} sec)" if best_type == "Reel" else best_type
    reach_gain = pct_diff(ts.loc[best_type, "reach"], overall_reach)
    why = (f"{best_type} posts earn {reach_gain}% more reach (relative to followers) than your overall average. "
           f"'{best_topic}' {best_type} posts have {topic_gain}% higher shares + saves than your average {best_type}. "
           f"Your best posting hours are {', '.join(str(h) + ':00' for h in hours)}. "
           f"Over your last 30 posts, {objective.lower()} changed by {gaps[objective]}% compared with your "
           f"long-term average, so that is the metric to focus on.")

    # 7-day plan: best format 4 times, second best 2 times, third once
    overall = {"Reach": overall_reach, "Saves": df["save_rate"].mean(), "Shares": df["share_rate"].mean()}
    goal_for = {}
    for t in order:
        ratios = {"Reach": ts.loc[t, "reach"] / overall["Reach"],
                  "Saves": ts.loc[t, "save"] / overall["Saves"],
                  "Shares": ts.loc[t, "share"] / overall["Shares"]}
        goal_for[t] = max(ratios, key=ratios.get)

    slots = [order[min(i, len(order) - 1)] for i in (0, 1, 0, 2, 0, 1, 0)]
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    used = {t: 0 for t in order}
    plan = []
    for i, t in enumerate(slots):
        tl = topics_for(t).index.tolist()
        topic = tl[used[t] % len(tl)]
        used[t] += 1
        plan.append({"day": days[i], "type": t, "topic": topic,
                     "time": f"{hours[i % len(hours)]}:00", "goal": goal_for[t]})

    return jsonify({
        "next": {"topic": best_topic, "format": fmt_text, "window": window,
                 "objective": f"Increase {objective.lower()}", "why": why},
        "plan": plan,
    })

@app.route("/api/anomalies")
def anomalies():
    df = query("""SELECT post_id, post_date, post_type, topic, reach, followers, reach_ratio
                  FROM posts ORDER BY post_date""").reset_index(drop=True)
    alerts = []
    for i in range(max(30, len(df) - 120), len(df)):
        row = df.iloc[i]
        prev = df.iloc[:i]
        prev = prev[prev["post_type"] == row["post_type"]].tail(30)
        if len(prev) < 10:
            continue
        mean, std = prev["reach_ratio"].mean(), prev["reach_ratio"].std()
        z = (row["reach_ratio"] - mean) / std if std else 0
        if abs(z) >= 2:
            normal = mean * row["followers"]
            alerts.append({
                "post_id": int(row["post_id"]), "date": str(row["post_date"]),
                "type": row["post_type"], "topic": row["topic"],
                "reach": int(row["reach"]), "normal": int(normal),
                "pct": pct_diff(row["reach"], normal), "z": round(float(z), 2),
                "kind": "drop" if z < 0 else "spike",
            })
    return jsonify({"alerts": alerts[::-1][:8]})


@app.route("/api/check_reach")
def check_reach():
    post_type = request.args.get("post_type", "Reel")
    if post_type not in POST_TYPES:
        return jsonify({"error": "Invalid post type"}), 400
    try:
        reach = float(request.args.get("reach", ""))
    except ValueError:
        return jsonify({"error": "Enter a reach number"}), 400

    recent = query(f"""SELECT reach FROM posts WHERE post_type = '{post_type}'
                       ORDER BY post_date DESC LIMIT 30""")["reach"]
    mean, std = float(recent.mean()), float(recent.std())
    z = (reach - mean) / std if std else 0
    status = "Unusual drop" if z <= -2 else ("Unusual spike" if z >= 2 else "Normal")
    return jsonify({"status": status, "average": int(mean), "reach": int(reach),
                    "pct": pct_diff(reach, mean), "z": round(z, 2), "type": post_type})

if __name__ == "__main__":
    app.run(debug=True)
