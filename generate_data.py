import numpy as np
import pandas as pd
import random

np.random.seed(42)
random.seed(42)

N_POSTS = 300
start_date = pd.Timestamp("2025-10-01")

topics = ["Python Tips", "Python Interview Tips", "SQL Tutorial",
          "Data Analysis", "Machine Learning Basics",
          "Career Advice", "Excel Tricks"]

rows = []
followers = 10000

for i in range(N_POSTS):
    post_id = 1000 + i
    date = start_date + pd.Timedelta(days=i)
    followers += random.randint(10, 60)

    post_type = random.choices(["Reel", "Carousel", "Image"],
                               weights=[0.5, 0.3, 0.2])[0]
    topic = random.choice(topics)
    hour = random.choices(
        [9, 12, 15, 18, 19, 20, 21, 22],
        weights=[0.05, 0.1, 0.1, 0.2, 0.2, 0.15, 0.15, 0.05])[0]
    hashtags = random.randint(3, 15)
    caption_length = random.randint(50, 300)
    duration = random.randint(15, 60) if post_type == "Reel" else 0

    # --- Built-in patterns the model can learn ---
    type_factor = {"Reel": 2.2, "Carousel": 1.3, "Image": 1.0}[post_type]
    hour_factor = 1.3 if 18 <= hour <= 21 else (1.0 if 12 <= hour < 18 else 0.8)
    duration_factor = 1.2 if (post_type == "Reel" and 20 <= duration <= 40) else 1.0
    hashtag_factor = 1 + 0.02 * min(hashtags, 10)
    noise = np.random.lognormal(0, 0.25)

    reach = int(followers * 0.8 * type_factor * hour_factor
                * duration_factor * hashtag_factor * noise)
    impressions = int(reach * random.uniform(1.1, 1.5))
    likes = int(reach * random.uniform(0.04, 0.08))
    comments = int(likes * random.uniform(0.02, 0.05))
    shares = int(reach * random.uniform(0.005, 0.02) * (1.5 if post_type == "Reel" else 1))
    saves = int(reach * random.uniform(0.005, 0.02) * (1.8 if post_type == "Carousel" else 1))

    rows.append({
        "post_id": post_id, "date": date.date(), "post_type": post_type,
        "topic": topic, "caption_length": caption_length,
        "hashtags_count": hashtags, "video_duration": duration,
        "posting_hour": hour, "likes": likes, "comments": comments,
        "shares": shares, "saves": saves, "reach": reach,
        "impressions": impressions, "followers": followers
    })

df = pd.DataFrame(rows)

# --- Comments (created before adding messy data) ---
positive = ["Very useful content!", "Love this reel ❤️", "Great explanation, thank you!",
            "This helped me a lot", "Amazing tutorial 🔥", "Super clear and simple"]
neutral = ["When will you upload part 2?", "Can you make a video on this topic?",
           "Which tool did you use?", "Please share the code"]
negative = ["Too fast, couldn't follow", "Not useful for beginners",
            "Audio quality is poor", "Too expensive course", "Poor explanation"]

comment_rows = []
comment_id = 1
for pid in df["post_id"]:
    for _ in range(random.randint(3, 12)):
        group = random.choices([positive, neutral, negative],
                               weights=[0.6, 0.25, 0.15])[0]
        comment_rows.append({"comment_id": comment_id, "post_id": pid,
                             "comment_text": random.choice(group)})
        comment_id += 1

comments_df = pd.DataFrame(comment_rows)

# --- Add messy data on purpose (for cleaning practice in Step 3) ---
missing_idx = df.sample(5, random_state=1).index
df.loc[missing_idx, "likes"] = np.nan
df = pd.concat([df, df.sample(3, random_state=2)], ignore_index=True)

# --- Save ---
df.to_csv("data/posts_raw.csv", index=False)
comments_df.to_csv("data/comments.csv", index=False, encoding="utf-8")

print("Posts file:", df.shape)
print("Comments file:", comments_df.shape)
print(df.head())