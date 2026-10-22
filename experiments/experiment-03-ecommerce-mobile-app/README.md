# Experiment 03 — E Commerce Mobile App Prototype for Stakeholder Review

## Aim

To create an interactive e-commerce mobile app prototype using Figma, compare conflicting interface preferences, and provide a working local app through which stakeholders can give feedback and record approval decisions, while customers can simulate reviewing products after purchase.

## Tools Required

- Figma account and internet connection.
- Web browser.
- HTML, CSS, and JavaScript.
- Node.js for the local testing server.
- Manrope font and product photography from Unsplash, stored locally with source references in `asset-sources.json`.

## Algorithm

1. Identify the competing interface preferences: a calm, product-first layout and a bold, promotion-led layout.
2. Create **390 × 844 pixel** mobile frames in Figma for discovery, collection browsing, product selection, shopping bag, delivery details, payment review, confirmation, the alternative visual direction, and product review screens.
3. Use editable text, vector icons, reusable product cards, shared controls, and separate product images. Connect the shopping flow as **Discover → Collection → Product → Bag → Delivery → Payment → Confirmation**.
4. Add a stakeholder comparison area and two prototype starting points so both directions can be discussed in Figma. Use Figma comments for shared feedback.
5. Implement the same experience in the local `dist/` app, including search, categories, sorting, favourites, product options, stock limits, cart updates, and the `FIRST10` sample discount.
6. Run the local app from this experiment's folder:

   ```powershell
   node server.cjs
   ```

   Open **http://127.0.0.1:4823/**. On the current computer, `Start-FORME.ps1` also locates the bundled Node.js runtime. The server binds only to this computer's loopback address.

7. Select a product and its options, add it to the bag, update quantities, and review subtotal, discount, delivery, and total. Complete guest checkout using **Fill sample details**, select a simulated payment method, and place a demo order.
8. After checkout, use the **How was your purchase?** prompt to review each distinct purchased product. Choose **Maybe later** to dismiss the prompt and return through **Orders** or the **Reviews** tab.
9. Open the separate **Reviews** area, choose a product, and enter a 1–5 star rating, reviewer name, review title, and product experience. Save the local review, view it on the product page, and use **Edit review** to update it. Demo purchase badges require a matching saved order. Reviews persist in this browser and stay separate from stakeholder design decisions.
10. Open **Orders** and advance the sample order through **Placed → Packed → Shipped → Delivered**. Download the demo receipt.
11. Compare **A · Calm** and **B · Bold** in the review panel. Enter a reviewer name, give screen-specific feedback, and choose **Leave feedback**, **Request changes**, or **Approve this direction**. Export the review log as JSON when needed.
12. Verify required size selection, invalid promo codes and PIN codes, stock limits, cart persistence, checkout, tracking, downloaded files, customer review validation, editing, persistence, safe text rendering, and stakeholder review decisions. Use **Start a fresh testing session** to clear prototype test data before another review. Keep the app unpublished.

## Output Screenshots

**Editable Figma Shopping Flow and Stakeholder Comparison**

![Figma mobile commerce screens and comparison area](screenshots/01-figma-flow.png)

**Local App with Direction A and Review Panel**

![Local FORME app and stakeholder review panel](screenshots/02-home-calm.jpg)

**Shopping Bag and Discount Calculation**

![Shopping bag with FIRST10 discount and delivery total](screenshots/03-cart-discount.jpg)

**Guest Checkout and Simulated Payment Review**

![Guest checkout with address, payment options, and total](screenshots/04-checkout-payment.jpg)

**Mobile Order Tracking**

![Demo order advanced through delivery on a mobile viewport](screenshots/05-order-tracking-mobile.jpg)

**Stakeholder Feedback and Approval Controls**

![Review controls with explicitly labelled QA sample decisions](screenshots/06-stakeholder-review.jpg)

**Demo Order Confirmation**

![Confirmed backpack order and final amount](screenshots/07-order-confirmation.jpg)

**Direction B for Comparison**

![Bold promotional design direction in the same local app](screenshots/08-home-bold.jpg)

**Post Purchase Product Review Prompt**

![Mobile order confirmation asking customers for product reviews](screenshots/09-post-purchase-review.png)

**Separate Product Review Area**

![Saved customer review with stars and demo purchase badge](screenshots/10-product-reviews.png)

**Editable Figma Product Review Simulation**

![Figma post purchase prompt, review form, and saved product review screens](screenshots/11-figma-product-review-flow.png)

[Open the editable Figma design](https://www.figma.com/design/eOVcbMChHuLdyBYFjy3JN3?node-id=5-210).

[Open the Figma shopping prototype](https://www.figma.com/proto/eOVcbMChHuLdyBYFjy3JN3?node-id=5-217&starting-point-node-id=5%3A217).

[Open the Figma product review flow](https://www.figma.com/proto/eOVcbMChHuLdyBYFjy3JN3?node-id=15-707&starting-point-node-id=15%3A707). Figma uses a prefilled demo review; the local app accepts typed reviews and saves them in the browser.

## Result

A polished Figma mobile prototype and an unpublished local app were created. The complete shopping, guest checkout, simulated order tracking, customer product review, and stakeholder feedback workflows were tested in the browser. Post purchase prompts, the separate Reviews area, 1–5 star ratings, required-field validation, review editing, safe text rendering, and refresh persistence were verified. Receipts and review logs were downloaded and checked. The two visual directions can be compared before a stakeholder decision is recorded.

Orders and payments are simulated. Cart, favourites, demo addresses, orders, customer product reviews, and stakeholder review decisions persist in the testing browser. Screenshots containing approvals show explicitly labelled QA examples; real stakeholder approval remains pending. The final local session was reset to **Awaiting feedback** for actual stakeholder testing.
