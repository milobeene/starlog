package com.milobeene.gamebacklog;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import javax.sql.DataSource;
import java.sql.Connection;

@SpringBootTest
public class DataSourceTest {

    @Autowired
    DataSource dataSource;

    @Test
    void connect() throws Exception {
        try (Connection conn = dataSource.getConnection()) {
            System.out.println("URL = " + conn.getMetaData().getURL());
        }
    }
}
