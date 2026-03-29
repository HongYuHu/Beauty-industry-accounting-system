/* ============================================================
   charts.js — Chart.js 圖表設定
   ============================================================ */

const Charts = (() => {
  let monthlyChart = null;
  let pieChart     = null;

  const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  const PINK_COLORS = [
    '#e91e8c','#9c27b0','#009688','#ff9800','#f44336',
    '#3f51b5','#00bcd4','#8bc34a','#ff5722','#607d8b',
  ];

  // ── 全年月份營收 vs 支出（雙柱） ────────────────────────────
  function renderMonthly(revenueArr, expenseArr) {
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    if (monthlyChart) monthlyChart.destroy();

    monthlyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: MONTHS,
        datasets: [
          {
            label: '營收',
            data: revenueArr,
            backgroundColor: 'rgba(233,30,140,.75)',
            borderRadius: 6,
            borderSkipped: false,
          },
          {
            label: '支出',
            data: expenseArr,
            backgroundColor: 'rgba(156,39,176,.45)',
            borderRadius: 6,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { size: 12 }, usePointStyle: true },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` $${Number(ctx.raw).toLocaleString()}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } },
          },
          y: {
            grid: { color: 'rgba(0,0,0,.05)' },
            ticks: {
              font: { size: 11 },
              callback: v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`,
            },
          },
        },
      },
    });
  }

  // ── 服務項目佔比（甜甜圈） ───────────────────────────────────
  function renderServicePie(labels, counts) {
    const ctx = document.getElementById('servicePieChart').getContext('2d');
    if (pieChart) pieChart.destroy();

    pieChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: counts,
          backgroundColor: PINK_COLORS.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 12 }, usePointStyle: true, padding: 14 },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}：${ctx.raw} 次`,
            },
          },
        },
      },
    });
  }

  return { renderMonthly, renderServicePie };
})();
