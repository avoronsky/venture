// The starting point for a new investor update: a structure investors are used to reading,
// in email-safe HTML (inline styles, one column, no scripts or external CSS).

export function starterUpdate(orgName: string, today = new Date()): {subject: string; body_html: string} {
    const month = today.toLocaleString("en-US", {month: "long", year: "numeric"});
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const h2 = "margin:28px 0 8px;font-size:16px;line-height:1.3;color:#191c1a;";
    const td = "padding:8px 12px;border-bottom:1px solid #e4e6e1;";
    const org = esc(orgName);
    return {
        subject: `${orgName} investor update · ${month}`,
        body_html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:620px;margin:0 auto;padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#2b302c;">
<p style="margin:0 0 16px;">Hi {{first_name|there}},</p>
<p style="margin:0 0 16px;">Here's what happened at ${org} over the last two weeks.</p>

<h2 style="${h2}">TL;DR</h2>
<ul style="margin:0;padding-left:20px;">
<li>One line on the most important thing that happened.</li>
<li>One line on where you're headed next.</li>
</ul>

<h2 style="${h2}">Key numbers</h2>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
<tr><td style="${td}">Cash in bank</td><td style="${td}text-align:right;font-weight:600;">$0</td></tr>
<tr><td style="${td}">Monthly burn</td><td style="${td}text-align:right;font-weight:600;">$0</td></tr>
<tr><td style="${td}">Runway</td><td style="${td}text-align:right;font-weight:600;">0 months</td></tr>
<tr><td style="${td}">Team</td><td style="${td}text-align:right;font-weight:600;">0 people</td></tr>
</table>

<h2 style="${h2}">Highlights</h2>
<ul style="margin:0;padding-left:20px;">
<li>Product and engineering progress</li>
<li>Customers, pilots and partnerships</li>
<li>Hiring</li>
</ul>

<h2 style="${h2}">Challenges</h2>
<p style="margin:0 0 16px;">What's harder than expected, and what you're doing about it.</p>

<h2 style="${h2}">How you can help</h2>
<ul style="margin:0;padding-left:20px;">
<li>A specific intro you're looking for</li>
<li>A role you're hiring for</li>
</ul>

<p style="margin:28px 0 0;">Thank you for your support,</p>
<p style="margin:0;">The ${org} team</p>
</div>
</body>
</html>
`,
    };
}
