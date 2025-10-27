# TURN Server Setup and Configuration

This document explains how to configure and deploy the integrated TURN server for WebRTC functionality in BafaChat.

## What is TURN?

TURN (Traversal Using Relays around NAT) is a protocol that helps WebRTC connections work through firewalls and NAT (Network Address Translation). When peer-to-peer connections fail (about 8-10% of cases), TURN acts as a relay server to ensure reliable WebRTC communication.

## Configuration

The TURN server is integrated into the BafaChat server application. It can be enabled via environment variables.

### Environment Variables

Add these to your `server/.env` file or set them in your production environment:

```bash
# Enable the TURN server
TURN_ENABLED=true

# Public IP address of your server (REQUIRED)
# This should be the public IP that clients can reach
TURN_PUBLIC_IP=your-public-ip-address

# UDP port for TURN server (default: 3478)
TURN_PORT=3478

# TURN server realm (default: "bafachat")
TURN_REALM=bafachat

# TURN authentication credentials
TURN_USERNAME=bafachat
TURN_PASSWORD=your-secure-turn-password
```

### Required Configuration

When enabling the TURN server, you **must** configure:

1. **TURN_ENABLED**: Set to `true`
2. **TURN_PUBLIC_IP**: Your server's public IP address
3. **TURN_PASSWORD**: A strong, secure password

### Optional Configuration

- **TURN_PORT**: Default is 3478 (standard TURN port)
- **TURN_REALM**: Default is "bafachat"
- **TURN_USERNAME**: Default is "bafachat"

## Production Deployment Requirements

### Firewall Configuration

You **must** open the following UDP port on your server's firewall:

```bash
# For Ubuntu/Debian with UFW
sudo ufw allow 3478/udp

# For RHEL/CentOS with firewalld
sudo firewall-cmd --permanent --add-port=3478/udp
sudo firewall-cmd --reload

# For cloud providers (AWS, GCP, Azure, DigitalOcean)
# Configure security groups/firewall rules to allow:
# - Protocol: UDP
# - Port: 3478 (or your custom TURN_PORT)
# - Source: 0.0.0.0/0 (allow from anywhere)
```

### Cloud Provider Specific Instructions

#### AWS
1. Go to EC2 Console → Security Groups
2. Edit inbound rules for your instance's security group
3. Add rule:
   - Type: Custom UDP
   - Port: 3478
   - Source: 0.0.0.0/0

#### DigitalOcean
1. Go to Networking → Firewalls
2. Add inbound rule:
   - Protocol: UDP
   - Port: 3478
   - Sources: All IPv4, All IPv6

#### Google Cloud Platform
1. Go to VPC Network → Firewall
2. Create firewall rule:
   - Direction: Ingress
   - Targets: All instances or specific target tags
   - Source IP ranges: 0.0.0.0/0
   - Protocols and ports: udp:3478

#### Azure
1. Go to Network Security Groups
2. Add inbound security rule:
   - Source: Any
   - Source port ranges: *
   - Destination: Any
   - Destination port ranges: 3478
   - Protocol: UDP

### Network Configuration

1. **Public IP Address**: Your TURN server needs to be accessible via a public IP address. Make sure:
   - Your server has a static public IP
   - Set `TURN_PUBLIC_IP` to this address
   - The IP is reachable from the internet

2. **Port Availability**: Ensure port 3478/UDP is not in use by other services:
   ```bash
   sudo netstat -ulnp | grep 3478
   # Should show nothing if port is free
   ```

3. **DNS (Optional)**: For better management, consider using a DNS hostname:
   - Point a subdomain to your server (e.g., turn.yourdomain.com)
   - Use the IP address of that hostname for TURN_PUBLIC_IP

### Security Considerations

1. **Strong Password**: Use a strong, randomly generated password for TURN_PASSWORD
   ```bash
   # Generate a secure password
   openssl rand -base64 32
   ```

2. **Credentials Rotation**: Periodically update the TURN_USERNAME and TURN_PASSWORD

3. **Monitor Usage**: Keep an eye on bandwidth usage as TURN relay can be bandwidth-intensive

4. **Rate Limiting**: The TURN server handles authentication, but consider adding network-level rate limiting if needed

## Testing the TURN Server

### Check if TURN Server is Running

After starting your server with TURN enabled, check the logs:

```bash
# You should see:
# TURN server started on UDP port 3478
```

### Test TURN Connectivity

You can use the Trickle ICE test tool to verify your TURN server:

1. Visit: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
2. Remove default servers
3. Add your TURN server:
   ```
   turn:your-public-ip:3478
   ```
4. Set username and password to your TURN credentials
5. Click "Gather candidates"
6. Look for "relay" type candidates - these indicate TURN is working

### Using curl to Test TURN Server

```bash
# Install coturn tools (for testing)
sudo apt-get install coturn

# Test TURN server
turnutils_uclient -v -u bafachat -w your-secure-turn-password your-public-ip
```

## Architecture

When TURN is enabled:

1. The TURN server starts automatically with the main application
2. WebRTC configuration is automatically updated to include the TURN server
3. Clients receive TURN server credentials when joining audio/video channels
4. WebRTC connections attempt in this order:
   - Direct peer-to-peer (best performance)
   - Through STUN server (if direct fails)
   - Through TURN server (as last resort)

## Performance Considerations

- **Bandwidth**: TURN relay uses server bandwidth. For a 100kbps audio stream, expect ~100kbps per active relay
- **CPU**: TURN has minimal CPU overhead for relaying packets
- **Memory**: Minimal memory usage, scales with concurrent connections
- **Scaling**: For high traffic, consider running a dedicated TURN server cluster

## Troubleshooting

### TURN Server Won't Start

1. Check if another service is using port 3478:
   ```bash
   sudo netstat -ulnp | grep 3478
   ```

2. Verify environment variables are set correctly:
   ```bash
   echo $TURN_ENABLED
   echo $TURN_PUBLIC_IP
   echo $TURN_PASSWORD
   ```

3. Check server logs for error messages

### Clients Not Using TURN

1. Verify firewall allows UDP traffic on port 3478
2. Confirm TURN_PUBLIC_IP is correctly set to your server's public IP
3. Test with the Trickle ICE tool (see Testing section)
4. Check browser console for WebRTC errors

### High Bandwidth Usage

1. Monitor active TURN relays in server logs
2. Consider implementing connection limits
3. Evaluate if all connections really need TURN (most should use direct P2P)

## Development vs Production

### Development (Local)
In development, TURN is typically not needed. The default configuration uses Google's public STUN server, which works fine for local testing.

```bash
# Development - TURN disabled (default)
TURN_ENABLED=false
```

### Production
In production, enabling TURN ensures reliable connections for all users, especially those behind strict firewalls or NATs.

```bash
# Production - TURN enabled
TURN_ENABLED=true
TURN_PUBLIC_IP=203.0.113.42
TURN_PORT=3478
TURN_PASSWORD=your-secure-password
```

## Additional Resources

- [Pion TURN Documentation](https://github.com/pion/turn)
- [WebRTC TURN Guide](https://webrtc.org/getting-started/turn-server)
- [RFC 8656 - TURN Protocol](https://datatracker.ietf.org/doc/html/rfc8656)
