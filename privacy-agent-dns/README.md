# Privacy Agent house DNS filter

Run this on a computer that stays on (a laptop at home, a mini PC, or a Raspberry Pi). Point your **router DNS** at that computer. The filter uses the same house rules as Privacy Agent: shopping ads, health-adjacent trackers, and data brokers.

It does **not** stop first-party cookies, logins, or companies that already have your email. It blocks known tracker **domains** at DNS.

## Run from the agent app

For most users, open Privacy Agent, choose **On my network**, copy the house list into AdGuard or NextDNS, then tap **Check this network**.

Advanced local DNS, on a home computer:

```bash
npm run dev
```

Open `http://localhost:3001/privacy-agent/` and choose **This computer**.

Port 53 usually needs administrator rights. If the app says so, close Hub and start it with:

```bash
sudo npm run dev
```

On Windows, open Terminal as Administrator, then `npm run dev`, and tap the button again.

The same screen shows the LAN IP to paste into the router.

## Run from the terminal (optional)

```bash
sudo npm run privacy-dns
```

You should see this computer’s LAN IP, for example `192.168.1.42`.

Status page if you used the terminal helper:

`http://THAT-LAN-IP:8787`

## Point the house at it

1. Open the router admin page (often `192.168.1.1` or `192.168.0.1`, printed on the router).
2. Sign in. Find **DHCP**, **WAN**, or **Internet DNS**.
3. Set primary DNS to this computer’s LAN IP. Leave a public DNS (such as `1.1.1.1`) as backup only if the router requires two values — some routers skip the filter when a second DNS is set, so prefer this computer only.
4. Save. Renew Wi-Fi on phones (toggle airplane mode) or reboot them.

To protect **only this computer** instead of the whole house, set this device’s DNS to `127.0.0.1`.

## House rules file

Copy `house-rules.example.json` to `house-rules.json` in this folder, or download rules from Privacy Agent and save them here. Restart the filter after you change the file.

- Shopping **Never for ads** → advertising list on
- Health **Never for ads** → health-adjacent trackers on
- Brokers and fingerprinting lists stay on

## If port 53 is busy

Another app (Pi-hole, AdGuard Home, a VPN) may already own DNS. Stop that app, or use their blocklist import with the hosts file from Privacy Agent instead of this process.

```bash
PRIVACY_DNS_PORT=5353 npm run privacy-dns
```

Routers expect port 53. Port 5353 is only for testing on this computer.

## Safer first night

If you do not want to run a DNS server, download the hosts / domain list from Privacy Agent and paste it into [NextDNS](https://nextdns.io) or AdGuard Home, then point the router at that service.
