// =====================================================================
// 1. Main dashboard: KPI cards, insight, 4 charts, dark mode
// =====================================================================
$(function () {

  var config = { responsive: true, displayModeBar: false };
  var chartIds = ["chartType", "chartFollowers", "chartHourly", "chartRates"];

  // ---------- Colors (change them here) ----------
  var COLORS = {
    Reel: "#6366f1",
    Carousel: "#14b8a6",
    Image: "#f59e0b",
    line: "#6366f1",
    lineFill: "rgba(99,102,241,0.15)",
    save: "#6366f1",
    share: "#14b8a6",
    hourStrong: "#6366f1",
    hourSoft: "#c7d2fe"
  };

  // ---------- Helpers ----------
  function fmt(n, d) {
    d = d || 0;
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function toast(msg) {
    $("#toast").stop(true, true).text(msg).fadeIn(200).delay(2200).fadeOut(400);
  }

  function theme() {
    var dark = $("body").hasClass("dark");
    return { font: dark ? "#eceef5" : "#262626", grid: dark ? "#2a2d3b" : "#eceef5" };
  }

  function baseLayout(extra) {
    var t = theme();
    return $.extend(true, {
      margin: { t: 10, r: 10, b: 40, l: 55 },
      height: 300,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: t.font },
      xaxis: { gridcolor: t.grid },
      yaxis: { gridcolor: t.grid }
    }, extra);
  }

  // Count-up animation for the KPI numbers
  function countUp($el, target, decimals, prefix, suffix) {
    decimals = decimals || 0;
    prefix = prefix || "";
    suffix = suffix || "";
    $({ n: 0 }).animate({ n: target }, {
      duration: 1500,
      easing: "swing",
      step: function (now) { $el.text(prefix + fmt(now, decimals) + suffix); },
      complete: function () { $el.text(prefix + fmt(target, decimals) + suffix); }
    });
  }

  // Typing effect for the AI insight
  function typeText($el, text) {
    var i = 0;
    $el.addClass("typing").text("");
    var timer = setInterval(function () {
      i++;
      $el.text(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timer);
        $el.removeClass("typing");
      }
    }, 18);
  }

  // Draw a chart that starts flat, then animates to the real values.
  // makeTraces(true) = flat version, makeTraces(false) = real values.
  function drawChart(id, makeTraces, layout) {
    var lay = baseLayout(layout);
    Plotly.newPlot(id, makeTraces(true), lay, config)
      .then(function () {
        var finals = makeTraces(false);
        return Plotly.animate(id, {
          data: finals.map(function (t) { return { y: t.y }; }),
          traces: finals.map(function (_, i) { return i; })
        }, {
          transition: { duration: 900, easing: "cubic-in-out" },
          frame: { duration: 900, redraw: true }
        });
      })
      .catch(function (err) {
        console.error("Chart animation failed for " + id + ":", err);
        Plotly.react(id, makeTraces(false), lay, config);
      });
  }

  // ---------- Page setup ----------
  $("#today").text(new Date().toLocaleDateString("en-US",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" }));

  $(".nav-item.soon").on("click", function (e) {
    e.preventDefault();
    toast("This module will be added in the next steps 🚀");
  });

  $("#themeToggle").on("click", function () {
    $("body").toggleClass("dark");
    $(this).find("i").toggleClass("bi-moon-stars bi-sun");
    var t = theme();
    chartIds.forEach(function (id) {
      try {
        Plotly.relayout(id, {
          "font.color": t.font,
          "xaxis.gridcolor": t.grid,
          "yaxis.gridcolor": t.grid
        });
      } catch (e) { console.error(e); }
    });
  });

  // ---------- Load data with jQuery AJAX ----------
  $.when($.getJSON("/api/kpis"), $.getJSON("/api/charts"))
    .done(function (kpiRes, chartRes) {
      var kpi = kpiRes[0];
      var data = chartRes[0];

      // 1. Always remove the loader and show the cards first
      $("#loader").fadeOut(500);
      $(".anim").each(function (i) {
        $(this).css("animation-delay", (i * 90) + "ms").addClass("show");
      });

      try {
        // 2. KPI numbers count up
        countUp($("#followers"), kpi.followers);
        countUp($("#growth"), kpi.follower_growth, 0, "+");
        countUp($("#reach"), kpi.total_reach);
        countUp($("#engagement"), kpi.avg_engagement_rate, 2, "", "%");
        countUp($("#likes"), kpi.total_likes);
        countUp($("#comments"), kpi.total_comments);
        countUp($("#shares"), kpi.total_shares);
        countUp($("#saves"), kpi.total_saves);

        // 3. AI insight, built from real numbers
        var bestSave = data.by_type.reduce(function (a, b) {
          return b.avg_save_rate > a.avg_save_rate ? b : a;
        });
        typeText($("#insightText"),
          "Reels generated " + kpi.reel_reach_share + "% of total reach, while " +
          bestSave.post_type + " posts produced the highest save rate (" + bestSave.avg_save_rate + "%).");

        // 4. Prepare chart data
        var types = data.by_type.map(function (d) { return d.post_type; });
        var reachVals = data.by_type.map(function (d) { return d.avg_reach; });
        var saveVals = data.by_type.map(function (d) { return d.avg_save_rate; });
        var shareVals = data.by_type.map(function (d) { return d.avg_share_rate; });

        var months = data.monthly_followers.map(function (d) { return d.post_month; });
        var fol = data.monthly_followers.map(function (d) { return d.followers; });
        var lo = Math.min.apply(null, fol) * 0.9;

        var hours = data.hourly.map(function (d) { return d.posting_hour + ":00"; });
        var ratios = data.hourly.map(function (d) { return d.avg_reach_ratio; });
        var hourColors = data.hourly.map(function (d) {
          return (d.posting_hour >= 18 && d.posting_hour <= 21) ? COLORS.hourStrong : COLORS.hourSoft;
        });
        var topRate = Math.max.apply(null, saveVals.concat(shareVals));

        // 5. Chart 1: average reach by post type (one color per post type)
        drawChart("chartType", function (flat) {
          return [{
            x: types,
            y: flat ? reachVals.map(function () { return 0; }) : reachVals,
            type: "bar",
            marker: { color: types.map(function (t) { return COLORS[t]; }) }
          }];
        }, { yaxis: { title: "Avg reach", range: [0, Math.max.apply(null, reachVals) * 1.15] } });

        // 6. Chart 2: follower growth
        drawChart("chartFollowers", function (flat) {
          return [{
            x: months,
            y: flat ? fol.map(function () { return lo; }) : fol,
            type: "scatter",
            mode: "lines+markers",
            line: { color: COLORS.line, width: 3, shape: "spline" },
            fill: "tozeroy",
            fillcolor: COLORS.lineFill
          }];
        }, { yaxis: { title: "Followers", range: [lo, Math.max.apply(null, fol) * 1.05] } });

        // 7. Chart 3: best posting hour (6 to 9 PM highlighted)
        drawChart("chartHourly", function (flat) {
          return [{
            x: hours,
            y: flat ? ratios.map(function () { return 0; }) : ratios,
            type: "bar",
            marker: { color: hourColors }
          }];
        }, { yaxis: { title: "Reach ÷ followers", range: [0, Math.max.apply(null, ratios) * 1.15] } });

        // 8. Chart 4: save rate vs share rate
        drawChart("chartRates", function (flat) {
          return [
            { x: types, y: flat ? saveVals.map(function () { return 0; }) : saveVals,
              name: "Save rate %", type: "bar", marker: { color: COLORS.save } },
            { x: types, y: flat ? shareVals.map(function () { return 0; }) : shareVals,
              name: "Share rate %", type: "bar", marker: { color: COLORS.share } }
          ];
        }, { barmode: "group", yaxis: { range: [0, topRate * 1.2] } });

      } catch (err) {
        console.error("Dashboard error:", err);
        toast("Something failed: " + err.message);
      }
    })
    .fail(function (xhr) {
      $("#loader").html(
        "<p style='max-width:600px;text-align:center'>Could not load data (status " +
        xhr.status + "). Is the Flask server running?</p>"
      );
    });
});


// =====================================================================
// 2. AI Prediction form
// =====================================================================
$(function () {

  var fmt2 = function (n) { return Number(n).toLocaleString("en-US"); };

  // Sidebar link scrolls smoothly to the prediction card
  $("a[href='#predictSection']").on("click", function (e) {
    e.preventDefault();
    $("html, body").animate({ scrollTop: $("#predictSection").offset().top - 20 }, 600);
  });

  // Video length only matters for Reels
  function toggleDuration() { $("#durationGroup").toggle($("#pType").val() === "Reel"); }
  $("#pType").on("change", toggleDuration);
  toggleDuration();

  var btnHtml = '<i class="bi bi-magic"></i> Predict Performance';

  $("#predictBtn").on("click", function () {
    var $btn = $(this).prop("disabled", true).text("Predicting...");

    $.ajax({
      url: "/api/predict",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({
        post_type: $("#pType").val(),
        topic: $("#pTopic").val(),
        video_duration: $("#pDuration").val() || 0,
        posting_hour: $("#pHour").val() || 0,
        hashtags_count: $("#pTags").val() || 0,
        caption_length: $("#pCaption").val() || 0
      })
    })
    .done(function (r) {
      var bars = ["High", "Medium", "Low"].map(function (k) {
        var p = r.probabilities[k] || 0;
        return '<div class="prob-row"><span>' + k + '</span>' +
               '<div class="prob-track"><div class="prob-fill ' + k.toLowerCase() +
               '" style="width:' + p + '%"></div></div><span>' + p + '%</span></div>';
      }).join("");

      $("#predictResult").hide().html(
        '<div class="perf-badge ' + r.performance.toLowerCase() + '">' + r.performance + ' performance</div>' +
        '<div class="result-row"><span>Expected reach</span><strong>' +
          fmt2(r.reach_low) + ' – ' + fmt2(r.reach_high) + '</strong></div>' +
        '<div class="result-row"><span>Best estimate</span><strong>' + fmt2(r.expected_reach) + '</strong></div>' +
        '<div class="result-row"><span>Typical engagement for this type (history)</span><strong>' +
          r.typical_engagement + '%</strong></div>' +
        '<div class="mt-3 mb-1 small text-muted">Model confidence</div>' + bars
      ).fadeIn(400);
    })
    .fail(function (xhr) {
      var msg = (xhr.responseJSON && xhr.responseJSON.error) || "Server error";
      $("#predictResult").html('<span class="text-danger">Prediction failed: ' + msg + '</span>');
    })
    .always(function () {
      $btn.prop("disabled", false).html(btnHtml);
    });
  });
});


// =====================================================================
// 3. Comment sentiment section
// =====================================================================
$(function () {

  var cfg = { responsive: true, displayModeBar: false };
  var fontColor = function () { return $("body").hasClass("dark") ? "#eceef5" : "#262626"; };

  // Sidebar link scrolls smoothly to this section
  $("a[href='#sentimentSection']").on("click", function (e) {
    e.preventDefault();
    $("html, body").animate({ scrollTop: $("#sentimentSection").offset().top - 20 }, 600);
  });

  $.getJSON("/api/sentiment").done(function (s) {

    // Donut chart: positive / neutral / negative
    var labels = ["Positive", "Neutral", "Negative"];
    var values = labels.map(function (l) { return s.counts[l] || 0; });

    Plotly.newPlot("chartSentiment", [{
      labels: labels,
      values: values,
      type: "pie",
      hole: 0.55,
      sort: false,
      textinfo: "percent",
      marker: { colors: ["#10b981", "#94a3b8", "#f43f5e"] }
    }], {
      margin: { t: 10, r: 10, b: 10, l: 10 },
      height: 260,
      paper_bgcolor: "rgba(0,0,0,0)",
      font: { color: fontColor() },
      legend: { orientation: "h", x: 0.1, y: -0.05 }
    }, cfg);

    $("#sentimentSummary").text(
      s.total.toLocaleString("en-US") + " comments analyzed · " +
      (s.percent.Positive || 0) + "% positive");

    // Horizontal bar chart: topics
    var topics = s.topics.slice().reverse();
    Plotly.newPlot("chartTopics", [{
      x: topics.map(function (t) { return t.n; }),
      y: topics.map(function (t) { return t.topic; }),
      type: "bar",
      orientation: "h",
      marker: { color: "#6366f1" }
    }], {
      margin: { t: 10, r: 10, b: 30, l: 120 },
      height: 300,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: fontColor() },
      xaxis: { gridcolor: "rgba(128,128,128,0.2)" }
    }, cfg);

    // Top negative comments
    var $list = $("#negList").empty();
    s.negative_samples.forEach(function (c) {
      var $li = $("<li>").text(c.text);
      $("<span>").addClass("neg-count").text(c.n + "×").appendTo($li);
      $list.append($li);
    });
  })
  .fail(function (xhr) {
    var msg = (xhr.responseJSON && xhr.responseJSON.error) || "could not load";
    $("#sentimentSummary").text("Sentiment data: " + msg);
  });

  // Keep these charts readable when dark mode is toggled
  $("#themeToggle").on("click", function () {
    ["chartSentiment", "chartTopics"].forEach(function (id) {
      try { Plotly.relayout(id, { "font.color": fontColor() }); } catch (e) {}
    });
  });
});


// =====================================================================
// 4. Recommendations and "Why did this post perform?"
// =====================================================================
$(function () {

  function esc(t) { return $("<div>").text(t).html(); }
  function row(label, value) {
    return '<div class="reco-row"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
  }

  // Sidebar link scrolls smoothly to this section
  $("a[href='#recoSection']").on("click", function (e) {
    e.preventDefault();
    $("html, body").animate({ scrollTop: $("#recoSection").offset().top - 20 }, 600);
  });

  // Fill the post dropdown
  $.getJSON("/api/recent_posts").done(function (posts) {
    var $sel = $("#explainSelect").empty();
    posts.forEach(function (p) { $sel.append($("<option>").val(p.post_id).text(p.label)); });
  });

  // ---- Why did this post perform? ----
  $("#explainBtn").on("click", function () {
    var id = $("#explainSelect").val();
    if (!id) { return; }
    var $b = $(this).prop("disabled", true).text("Analyzing...");

    $.getJSON("/api/explain/" + id)
      .done(function (r) {
        var items = r.points.map(function (p) {
          var icon = p.good ? "bi-check-circle-fill ok" : "bi-exclamation-circle-fill warn";
          return '<li><i class="bi ' + icon + '"></i><span>' + esc(p.text) + '</span></li>';
        }).join("");

        $("#explainResult").hide().html(
          '<div class="perf-badge ' + r.post.level.toLowerCase() + '">' + esc(r.post.level) + ' performance</div>' +
          '<div class="small text-muted">' +
            esc(r.post.type + " · " + r.post.topic + " · reach " + r.post.reach.toLocaleString("en-US")) + '</div>' +
          '<ul class="point-list">' + items + '</ul>' +
          '<div class="small text-muted mt-2">' + esc(r.summary) + '</div>'
        ).fadeIn(400);
      })
      .fail(function () { $("#explainResult").html('<span class="text-danger">Could not analyze this post.</span>'); })
      .always(function () { $b.prop("disabled", false).html('<i class="bi bi-cpu"></i> Explain Performance'); });
  });

  // ---- What should I post next? ----
  $("#recoBtn").on("click", function () {
    var $b = $(this).prop("disabled", true).text("Analyzing...");

    $.getJSON("/api/recommend")
      .done(function (r) {
        var n = r.next;
        $("#recoResult").hide().html(
          '<div class="reco-title"><i class="bi bi-bullseye"></i> Recommended next content</div>' +
          row("Topic", n.topic) +
          row("Format", n.format) +
          row("Best posting window", n.window) +
          row("Primary objective", n.objective) +
          '<div class="reco-why"><strong>Why:</strong> ' + esc(n.why) + '</div>'
        ).fadeIn(400);

        var rows = r.plan.map(function (d) {
          return "<tr><td><strong>" + esc(d.day) + "</strong></td><td>" + esc(d.type) + "</td><td>" +
                 esc(d.topic) + "</td><td>" + esc(d.time) + "</td><td>" + esc(d.goal) + "</td></tr>";
        }).join("");
        $("#planBody").hide().html(rows).fadeIn(400);
      })
      .fail(function () { $("#recoResult").html('<span class="text-danger">Could not generate the recommendation.</span>'); })
      .always(function () { $b.prop("disabled", false).html('<i class="bi bi-magic"></i> Generate Recommendation'); });
  });
});

// =====================================================================
// 5. Alerts (anomaly detection)
// =====================================================================
$(function () {

  function esc(t) { return $("<div>").text(t).html(); }
  function num(x) { return Number(x).toLocaleString("en-US"); }
  function sign(p) { return (p > 0 ? "+" : "") + p + "%"; }

  $("a[href='#alertSection']").on("click", function (e) {
    e.preventDefault();
    $("html, body").animate({ scrollTop: $("#alertSection").offset().top - 20 }, 600);
  });

  // Alerts found in recent posts
  $.getJSON("/api/anomalies").done(function (r) {
    if (!r.alerts.length) {
      $("#alertList").text("No unusual posts found. Performance looks normal.");
      return;
    }
    $("#alertList").html(r.alerts.map(function (a) {
      var drop = a.kind === "drop";
      return '<div class="alert-item ' + a.kind + '">' +
        '<div class="alert-title">' + (drop ? "⚠️ Unusual drop" : "🚀 Unusual spike") +
          ' · ' + esc(a.type) + ' · ' + esc(a.date) + '</div>' +
        '<div>Reach <strong>' + num(a.reach) + '</strong> vs normal ' + num(a.normal) +
          ' (<strong>' + sign(a.pct) + '</strong>)</div>' +
        '<div class="small text-muted">Post #' + a.post_id + ' · ' + esc(a.topic) +
          ' · z-score ' + a.z + ' vs your previous 30 ' + esc(a.type) + ' posts</div></div>';
    }).join(""));
  }).fail(function () {
    $("#alertList").html('<span class="text-danger">Could not load alerts.</span>');
  });

  // Manual check of a new post
  $("#aBtn").on("click", function () {
    var $b = $(this).prop("disabled", true).text("Checking...");
    $.getJSON("/api/check_reach", { post_type: $("#aType").val(), reach: $("#aReach").val() })
      .done(function (r) {
        var cls = r.status === "Normal" ? "high" : (r.status === "Unusual drop" ? "low" : "medium");
        var word = r.pct < 0 ? "below" : "above";
        $("#aResult").hide().html(
          '<div class="perf-badge ' + cls + '">' + esc(r.status) + '</div>' +
          '<div class="result-row"><span>Your average ' + esc(r.type) + ' reach</span><strong>' + num(r.average) + '</strong></div>' +
          '<div class="result-row"><span>This post</span><strong>' + num(r.reach) + '</strong></div>' +
          '<div class="small text-muted mt-2">' + Math.abs(r.pct) + '% ' + word +
            ' normal (z-score ' + r.z + '). Beyond ±2 is flagged as unusual.</div>'
        ).fadeIn(400);
      })
      .fail(function (xhr) {
        var msg = (xhr.responseJSON && xhr.responseJSON.error) || "Server error";
        $("#aResult").html('<span class="text-danger">' + esc(msg) + '</span>');
      })
      .always(function () { $b.prop("disabled", false).html('<i class="bi bi-search"></i> Check for Anomaly'); });
  });
});