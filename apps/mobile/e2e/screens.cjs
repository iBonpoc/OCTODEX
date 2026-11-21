/**
 * Every screen the layout run (specs/08-layouts.cjs) and the picture run (visual/screens.pw.cjs, #2312) open: one list, `/path?query`.
 * A new screen in src/app needs a line here (test/screens.test.ts); the order is the order of the run.
 */
const SCREENS = [
  "/today", "/figures/leads?period=month", "/triage", "/leads", "/visits", "/plan", "/messages", "/messages/c-c1", "/calls", "/tasks", "/clients", "/more", "/notifications", "/search?q=mitchell",
  "/lead/l1", "/lead/new", "/client/c1", "/property/p1", "/client/edit?id=c1", "/client/edit", "/client/import", "/client/imports",
  "/module/gutters/draw", "/module/gutters/list", "/module/gutters/start?customer=c1", "/module/gutters/view", "/module/gutters/settings", "/module/gutters/prices", "/estimate/new?id=e6", "/estimate/e5", "/estimate/signature", "/estimates", "/p/demo0handyman0estimate0000000001", "/f/f00000000000000000000000000000000",
  "/jobs", "/job/j1", "/job/new", "/job/schedule?jobId=j1", "/visit/v1",
  "/money", "/invoice", "/invoice?f=paid", "/payments", "/reports", "/reports/owed", "/reports/collected?p=all", "/reports/sales", "/reports/sources?p=all", "/reports/categories?p=all", "/invoice/i5", "/receipt/pay5", "/expense/new",
  "/catalog", "/catalog/cat-haul", "/suppliers", "/suppliers/sup-hd", "/purchase-orders", "/purchase-order/po-demo-1", "/company", "/settings/design-system", "/settings/design-system/base", "/settings/design-system/buttons", "/settings/design-system/selectors", "/settings/design-system/windows", "/settings/design-system/notices", "/settings/design-system/motion", "/settings/design-system/haptics", "/settings/design-system/rows", "/settings/design-system/fields", "/settings/design-system/choice", "/settings/design-system/spacing", "/settings/design-system/graphite", "/company/profile", "/company/schedule", "/company/leads", "/company/intake", "/company/payments", "/company/modules", "/company/checklists", "/company/checklist/tpl-job", "/estimate/templates", "/company/licenses", "/company/trades", "/team", "/settings", "/settings/profile", "/settings/delete-account", "/auth/trade", "/auth/terms", "/legal/terms", "/legal/privacy", "/help", "/auth/invite?token=a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
];
module.exports = { SCREENS };
