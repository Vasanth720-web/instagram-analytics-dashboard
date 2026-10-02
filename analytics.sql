#Query 1: Which post type performs best?
USE instagram_ai;

SELECT post_type,
       COUNT(*) AS total_posts,
       ROUND(AVG(reach)) AS avg_reach,
       ROUND(AVG(engagement_rate), 2) AS avg_engagement,
       ROUND(AVG(save_rate), 2) AS avg_save_rate
FROM posts
GROUP BY post_type
ORDER BY avg_reach DESC;

#Query 2: Top 10 posts by reach

SELECT post_id, post_date, post_type, topic, reach, engagement_rate
FROM posts
ORDER BY reach DESC
LIMIT 10;

#Query 3: Best posting hour
SELECT posting_hour,
       COUNT(*) AS posts,
       ROUND(AVG(reach_ratio), 2) AS avg_reach_ratio
FROM posts
GROUP BY posting_hour
ORDER BY avg_reach_ratio DESC;

#Query 4: Monthly follower growth
SELECT post_month,
       MIN(followers) AS followers_start,
       MAX(followers) AS followers_end,
       MAX(followers) - MIN(followers) AS growth
FROM posts
GROUP BY post_month
ORDER BY post_month;

#Query 5: Which topics work best?
SELECT topic,
       COUNT(*) AS posts,
       ROUND(AVG(share_rate), 2) AS avg_share_rate,
       ROUND(AVG(save_rate), 2) AS avg_save_rate
FROM posts
GROUP BY topic
ORDER BY avg_share_rate DESC;

#Query 6: Performance level by post type (uses a CASE and a count)
SELECT post_type,
       SUM(performance_level = 'High')   AS high_posts,
       SUM(performance_level = 'Medium') AS medium_posts,
       SUM(performance_level = 'Low')    AS low_posts
FROM posts
GROUP BY post_type;


