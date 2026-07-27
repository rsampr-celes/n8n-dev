ARG N8N_VERSION=2.30.5
FROM docker.n8n.io/n8nio/n8n:${N8N_VERSION}

USER root

# Install aliases in isolation so the asset's pinned validation runtime cannot
# overwrite or depend on n8n's own transitive Ajv packages.
RUN mkdir -p /opt/asset001-dependencies \
    && cd /opt/asset001-dependencies \
    && npm init -y \
    && npm install --omit=dev --no-audit --no-fund --install-strategy=nested \
      asset001-ajv@npm:ajv@8.20.0 \
      asset001-ajv-formats@npm:ajv-formats@3.0.1 \
    && cp -R node_modules/asset001-ajv /usr/local/lib/node_modules/n8n/node_modules/ \
    && cp -R node_modules/asset001-ajv-formats /usr/local/lib/node_modules/n8n/node_modules/ \
    && rm -rf /opt/asset001-dependencies

USER node
