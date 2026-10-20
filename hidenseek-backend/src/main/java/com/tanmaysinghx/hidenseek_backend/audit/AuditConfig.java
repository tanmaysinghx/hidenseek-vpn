package com.tanmaysinghx.hidenseek_backend.audit;

import org.springframework.boot.security.autoconfigure.web.servlet.SecurityFilterProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AuditConfig {

    /** Just outside Spring Security, inside the forwarded-header filter. */
    @Bean
    FilterRegistrationBean<AuditFilter> auditFilter(AuditService audit) {
        FilterRegistrationBean<AuditFilter> registration = new FilterRegistrationBean<>(new AuditFilter(audit));
        registration.setOrder(SecurityFilterProperties.DEFAULT_FILTER_ORDER - 10);
        registration.addUrlPatterns("/api/*");
        return registration;
    }
}
