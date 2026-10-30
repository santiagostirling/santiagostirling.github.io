# santiagostirling.github.io

Personal portfolio of **Santiago Stirling** — Power BI Developer & Financial Data Analyst.

🔗 **Live site:** https://santiagostirling.github.io

## Interactive dashboards

Three Power BI reports from different industries, rebuilt as interactive web dashboards (filters, cross-filtering by click, two pages each):

| Dashboard | Industry | Pages |
|---|---|---|
| [Nordia Cold Chain](https://santiagostirling.github.io/dashboards/nordia.html) | Cold chain logistics | Shipment Operations · Deliveries & Volume |
| [Coffee Market Observatory](https://santiagostirling.github.io/dashboards/coffee.html) | Market research | Market Overview · Brands & Segments |
| [Travessa Travel](https://santiagostirling.github.io/dashboards/travessa.html) | Travel & sales | Sales & Profitability · Sales Pipeline |

All dashboards use sample data. The original reports were built in Power BI Desktop (star-schema models, DAX time intelligence, market share, targets and pipeline measures).

## Structure

```
index.html                 Landing page (EN / ES)
dashboards/
  nordia.html              Interactive dashboards
  coffee.html
  travessa.html
  assets/dash.js           Small dashboard engine (filters, KPIs, cross-filtering)
  assets/dash.css
  assets/echarts.min.js    Apache ECharts 5.5.0
  data/*.json              Sample data exported from the Power BI models
images/dashboards/         Preview images
assets/docs/               CV
```
