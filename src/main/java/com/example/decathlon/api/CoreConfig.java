package com.example.decathlon.api;

import com.example.decathlon.core.CompetitionRegistry;
import com.example.decathlon.core.ScoringService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Wires the framework-free core classes into Spring. */
@Configuration
public class CoreConfig {

    @Bean
    public ScoringService scoringService() {
        return new ScoringService();
    }

    @Bean
    public CompetitionRegistry competitionRegistry(ScoringService scoring) {
        return new CompetitionRegistry(scoring);
    }
}
