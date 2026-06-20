import http from "k6/http";
import { check } from "k6";

// Run:  k6 run load_tests/order_load_test.js
// Tune VUs/duration to find sustained throughput and p95 latency for the README "Results" section.
export const options = {
  stages: [
    { duration: "30s", target: 20 },  // ramp up
    { duration: "1m", target: 20 },   // hold
    { duration: "10s", target: 0 },   // ramp down
  ],
};

export default function () {
  const payload = JSON.stringify({
    customer_id: "cust-" + Math.floor(Math.random() * 10000),
    items: [{ sku: "SKU-PHONE", quantity: 1 }],
  });
  const res = http.post("http://localhost:8000/orders", payload, {
    headers: { "Content-Type": "application/json" },
  });
  check(res, { "status is 202": (r) => r.status === 202 });
}
