package com.codeengine.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.tomcat.ConfigurableTomcatWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Serves HTTP on a Unix domain socket instead of a TCP port when {@code lcv.server.unix-socket} (env
 * {@code LCV_SERVER_UNIX_SOCKET}) is set. The production container runs with {@code --network none}, so neither the
 * server nor the child JVMs it spawns can reach any network; a reverse proxy in another container reaches the API
 * through this socket file on a shared volume. The JDWP link to the children still works over loopback.
 */
@Configuration
@ConditionalOnProperty("lcv.server.unix-socket")
public class UnixSocketConfig {

    @Bean
    WebServerFactoryCustomizer<ConfigurableTomcatWebServerFactory> unixSocketConnector(Environment env) {
        Path socket = Path.of(env.getRequiredProperty("lcv.server.unix-socket"));
        return factory -> factory.addConnectorCustomizers(connector -> {
            try {
                // A socket file left behind by a crash would make the bind fail.
                Files.deleteIfExists(socket);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
            connector.setProperty("unixDomainSocketPath", socket.toString());
            // The proxy runs as a different user in its own container.
            connector.setProperty("unixDomainSocketPathPermissions", "rw-rw-rw-");
        });
    }
}
