package com.codeengine.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final String[] allowedOrigins;

    /**
     * {@code lcv.cors.allowed-origins} (env {@code LCV_CORS_ALLOWED_ORIGINS}) is a comma-separated list of origin
     * patterns allowed to call the API from another site, e.g. the Cloudflare Pages frontend.
     */
    public WebConfig(@Value("${lcv.cors.allowed-origins}") String[] allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**").allowedOriginPatterns(allowedOrigins).allowedMethods("GET", "POST").maxAge(3600);
    }
}
