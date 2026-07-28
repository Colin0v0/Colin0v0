import { mkdir, writeFile } from "node:fs/promises";

// 仅保留 GitHub 的贡献强度等级；SVG 不含仓库、提交或议题等具体信息。
const COLOR_LEVELS = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];

const THEMES = {
  light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  dark: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
};

const token = process.env.CONTRIBUTION_TOKEN;

// 没有令牌时直接失败，避免悄悄生成缺少私有贡献的错误图表。
if (!token) {
  throw new Error("CONTRIBUTION_TOKEN is required");
}

const now = new Date();
const from = new Date(now);
from.setUTCDate(from.getUTCDate() - 364);

const query = `query ContributionCalendar($from: DateTime!, $to: DateTime!) {
  viewer {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionLevel
          }
        }
      }
    }
  }
}`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query,
    variables: { from: from.toISOString(), to: now.toISOString() },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed: ${response.status}`);
}

const result = await response.json();
if (result.errors?.length) {
  throw new Error(result.errors.map(({ message }) => message).join("; "));
}

const weeks = result.data.viewer.contributionsCollection.contributionCalendar.weeks;

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
}

function monthLabels() {
  let previousMonth = "";

  return weeks.flatMap((week, weekIndex) => {
    const firstDay = week.contributionDays[0];
    if (!firstDay) return [];

    const month = new Date(`${firstDay.date}T00:00:00Z`).toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC",
    });

    if (month === previousMonth) return [];
    previousMonth = month;

    return `<text x="${44 + weekIndex * 16}" y="20" class="month">${month}</text>`;
  });
}

function renderCalendar(theme) {
  const cells = weeks.flatMap((week, weekIndex) => week.contributionDays.map((day) => {
    const level = COLOR_LEVELS.indexOf(day.contributionLevel);
    const color = THEMES[theme][level];
    const date = escapeXml(day.date);
    const x = 44 + weekIndex * 16;
    const y = 34 + new Date(`${day.date}T00:00:00Z`).getUTCDay() * 16;

    return `<rect x="${x}" y="${y}" width="12" height="12" rx="2" fill="${color}"><title>${date}</title></rect>`;
  }));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="158" viewBox="0 0 900 158" role="img" aria-labelledby="title description">
  <title id="title">GitHub contribution frequency</title>
  <desc id="description">过去 365 天按日聚合的贡献频率。图中不包含仓库或提交详情。</desc>
  <style>
    .month, .day { fill: ${theme === "dark" ? "#8b949e" : "#57606a"}; font: 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  </style>
  <text x="0" y="61" class="day">Mon</text>
  <text x="0" y="93" class="day">Wed</text>
  <text x="0" y="125" class="day">Fri</text>
  ${monthLabels().join("")}
  ${cells.join("")}
</svg>`;
}

await mkdir("dist", { recursive: true });
await Promise.all([
  writeFile("dist/contribution-calendar.svg", renderCalendar("light")),
  writeFile("dist/contribution-calendar-dark.svg", renderCalendar("dark")),
]);
