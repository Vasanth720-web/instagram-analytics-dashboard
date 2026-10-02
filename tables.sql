CREATE DATABASE instagram_ai CHARACTER SET utf8mb4;
USE instagram_ai;


CREATE TABLE posts (
    post_id           INT PRIMARY KEY,
    post_date         DATE,
    post_type         VARCHAR(20),
    topic             VARCHAR(50),
    caption_length    INT,
    hashtags_count    INT,
    video_duration    INT,
    posting_hour      INT,
    likes             INT,
    comments          INT,
    shares            INT,
    saves             INT,
    reach             INT,
    impressions       INT,
    followers         INT,
    engagement_rate   DECIMAL(8,3),
    save_rate         DECIMAL(8,3),
    share_rate        DECIMAL(8,3),
    reach_ratio       DECIMAL(8,3),
    day_of_week       VARCHAR(15),
    post_month        VARCHAR(10),
    is_prime_time     TINYINT,
    performance_level VARCHAR(10)
);

CREATE TABLE comments (
    comment_id       INT PRIMARY KEY,
    post_id          INT,
    comment_text     VARCHAR(500),
    sentiment        VARCHAR(20),
    sentiment_score  DECIMAL(5,3),
    FOREIGN KEY (post_id) REFERENCES posts(post_id)
);

SHOW TABLES;











